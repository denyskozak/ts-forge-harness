/** Live Ollama + browser acceptance. Never substitutes a canned implementation. */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
import { Agent } from '../electron/agent';
import { Store } from '../electron/store';

const prompts = {
  emoji:
    'Build a simple emoji gallery with search and click-to-copy. Use the project’s existing stack; no API or new packages. Inspect the project and propose a short plan first.',
  button:
    'Remove all existing elements from the page and leave only a single button with the text "Hello World".',
};
const artifactRoot = path.resolve('.forge-test-results');
await fs.mkdir(artifactRoot, { recursive: true });
const directory = await fs.mkdtemp(path.join(artifactRoot, 'simple-apps-'));
const root = path.join(directory, 'project');
await fs.mkdir(root);
console.log('ARTIFACTS', directory);
const manifest = JSON.stringify({
  name: 'simple-app-eval',
  private: true,
  type: 'module',
  scripts: { build: 'tsc --noEmit', dev: 'vite --host 127.0.0.1' },
  dependencies: { react: '^19.2.0', 'react-dom': '^19.2.0' },
  devDependencies: { typescript: '5.9.3', vite: '^8.3.1' },
});
for (const name of [
  'react',
  'react-dom',
  'scheduler',
  '@types/react',
  '@types/react-dom',
  'csstype',
]) {
  const target = path.join(root, 'node_modules', name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(await fs.realpath(path.resolve('node_modules', name)), target, {
    recursive: true,
    dereference: true,
  });
}
await fs.writeFile(path.join(root, 'package.json'), manifest);
await fs.writeFile(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['*.tsx'],
  }),
);
await fs.writeFile(
  path.join(root, 'index.html'),
  '<html><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
);
await fs.writeFile(
  path.join(root, 'main.tsx'),
  'import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
);
await fs.writeFile(
  path.join(root, 'App.tsx'),
  'export default function App() { return <main><h1>Welcome</h1><p>Starter page</p><button>Count</button></main>; }\n',
);
const store = new Store(path.join(directory, 'state'));
await store.load();
store.value.workspacePath = root;
store.value.settings = {
  ...store.value.settings,
  endpoint: process.env.FORGE_EVAL_ENDPOINT ?? 'http://127.0.0.1:11434',
  model: process.env.FORGE_EVAL_MODEL ?? 'llama3.1:8b',
  mapFormat: 'compact',
  maxSteps: 12,
  contextTokens: 16384,
  temperature: 0,
};
const errors: string[] = [];
const agent = new Agent(store, (event) => {
  if (event.type === 'token') appendFileSync(path.join(directory, 'model-stream.txt'), event.text);
  if (event.type === 'approval')
    agent.approve(
      event.approval.id,
      ['write', 'changeset', 'typecheck', 'validation'].includes(event.approval.kind),
    );
  if (event.type === 'clarification') {
    errors.push('Unexpected clarification');
    agent.stop();
  }
  if (event.type === 'error') errors.push(JSON.stringify(event));
  if (['status', 'error', 'message'].includes(event.type)) console.log(JSON.stringify(event));
});
const results: unknown[] = [];
let sessionId: string | undefined;
try {
  for (const id of ['emoji', 'button'] as const) {
    const timer = setTimeout(() => {
      errors.push('Run timed out');
      agent.stop();
    }, 600_000);
    try {
      await agent.run(prompts[id], sessionId);
    } finally {
      clearTimeout(timer);
    }
    const session = store.value.sessions[0];
    sessionId = session.id;
    await fs.writeFile(
      path.join(directory, `${id}-session.json`),
      JSON.stringify(session, null, 2),
    );
    await fs.copyFile(path.join(root, 'App.tsx'), path.join(directory, `${id}-App.tsx`));
    assert.deepEqual(errors, [], 'Agent must finish without intervention');
    assert.notEqual(session.task?.outcome, 'failed');
    assert.ok(
      session.task?.validations.some(
        (v) => v.status === 'passed' && v.fingerprint === session.task?.fingerprint,
      ),
    );
    assert.equal(
      await fs.readFile(path.join(root, 'package.json'), 'utf8'),
      manifest,
      'No new packages',
    );
    const calls = session.messages
      .filter((m) => m.runId === session.task?.runId && m.role === 'tool')
      .map((m) => m.name);
    assert.ok(
      calls.indexOf('plan_task') >= 0 &&
        calls.indexOf('plan_task') <
          calls.findIndex((n) =>
            ['write_file', 'replace_text', 'apply_changeset'].includes(n ?? ''),
          ),
      'Plan before edits',
    );
    const server = await createServer({
      root,
      configFile: false,
      plugins: [react()],
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const page = await context.newPage();
      const runtimeErrors: string[] = [],
        apiRequests: string[] = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      page.on('request', (request) => {
        if (['fetch', 'xhr'].includes(request.resourceType())) apiRequests.push(request.url());
      });
      await page.goto(server.resolvedUrls!.local[0]);
      await expect(page.locator('#root')).not.toBeEmpty();
      if (id === 'button') {
        await expect(page.locator('#root button')).toHaveCount(1);
        await expect(page.locator('#root button')).toHaveText('Hello World');
        await expect(page.locator('#root')).toHaveText('Hello World');
        await expect(page.locator('#root input, #root img, #root canvas, #root svg')).toHaveCount(
          0,
        );
      } else {
        const input = page.locator('input').first();
        await expect(input).toBeVisible();
        const buttons = page.locator('button, [role="button"]');
        const readItems = () =>
          buttons.evaluateAll((elements) =>
            elements.flatMap((element, index) => {
              const emojiPattern =
                /\p{Extended_Pictographic}[\p{Emoji_Modifier}\uFE0F]*(?:\u200D\p{Extended_Pictographic}[\p{Emoji_Modifier}\uFE0F]*)*/gu;
              const own = element.textContent ?? '';
              const text = emojiPattern.test(own)
                ? own
                : (element.parentElement?.textContent ?? '');
              const glyphs = [...text.matchAll(new RegExp(emojiPattern.source, 'gu'))].map(
                (m) => m[0],
              );
              if (new Set(glyphs).size !== 1) return [];
              return [
                {
                  index,
                  glyph: glyphs[0],
                  label: [element.getAttribute('aria-label'), element.getAttribute('title'), text]
                    .filter(Boolean)
                    .join(' '),
                },
              ];
            }),
          );
        const initial = await readItems();
        assert.ok(
          initial.every((item) => /\p{Emoji}/u.test(item.glyph)),
          'Gallery must use assigned Unicode emoji, not unassigned pictographic code points',
        );
        assert.ok(
          new Set(initial.map((item) => item.glyph)).size >= 3,
          'Gallery must contain multiple actual emoji',
        );
        const label = initial[0].label;
        // A Copy button may sit beside an unnamed glyph. In that layout use a
        // conventional name for a known visible emoji, without reading source.
        const conventionalNames: Record<string, string> = {
          '😊': 'smile',
          '😄': 'smile',
          '😀': 'grin',
          '❤️': 'heart',
          '❤': 'heart',
          '🎉': 'tada',
          '👍': 'thumb',
          '🐱': 'cat',
          '🐶': 'dog',
          '⭐': 'star',
          '🍎': 'apple',
          '🍌': 'banana',
          '🍒': 'cherry',
        };
        const term =
          label
            .match(/[a-z]{3,}/gi)
            ?.find(
              (word) => !['copy', 'click', 'emoji', 'clipboard'].includes(word.toLowerCase()),
            ) ?? conventionalNames[initial[0].glyph];
        assert.ok(term, 'Need a visible or conventional emoji name to exercise search');
        const expected = initial[0].glyph;
        assert.ok(expected);
        await input.fill(term.toUpperCase());
        await expect(input).toHaveValue(term.toUpperCase());
        await expect.poll(async () => (await readItems()).length).toBeLessThan(initial.length);
        assert.ok(
          (await readItems()).some((item) => item.glyph === expected),
          'Search keeps matching emoji',
        );
        await input.fill('zzzz_no_match_471');
        await expect.poll(async () => (await readItems()).length).toBe(0);
        await input.fill('');
        await expect.poll(async () => (await readItems()).length).toBe(initial.length);
        for (let i = 0; i < Math.min(3, initial.length); i++) {
          const expectedCopy = initial[i].glyph;
          await page.evaluate(() => navigator.clipboard.writeText('clipboard sentinel'));
          await buttons.nth((await readItems())[i].index).click();
          await expect
            .poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toBe(expectedCopy);
        }
      }
      assert.deepEqual(runtimeErrors, []);
      assert.deepEqual(apiRequests, [], 'No API calls');
      await page.screenshot({ path: path.join(directory, `${id}-verified.png`), fullPage: true });
      results.push({ id, passed: true, model: store.value.settings.model });
      console.log('PASS browser acceptance:', id);
    } finally {
      await browser.close();
      await server.close();
    }
  }
} catch (error) {
  results.push({ passed: false, error: String(error) });
  process.exitCode = 1;
  console.error(error);
} finally {
  await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify(results, null, 2));
  await store.close();
}
