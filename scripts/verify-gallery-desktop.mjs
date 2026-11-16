/** Live Qwen acceptance through Forge's Electron IPC and its isolated browser. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron, expect } from '@playwright/test';
import electronPath from 'electron';

const root = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the path to a prepared React/TypeScript test workspace.');
const artifactsRoot = path.resolve('.forge-test-results');
await mkdir(artifactsRoot, { recursive: true });
const output = await mkdtemp(path.join(artifactsRoot, 'gallery-desktop-'));
console.log('ARTIFACTS', output);
const model = 'qwen2.5:1.5b';
const manifest = await readFile(path.join(root, 'package.json'), 'utf8');
const app = await electron.launch({
  executablePath: electronPath,
  args: ['.'],
  env: { ...process.env, NODE_ENV: 'test', FORGE_TEST_DATA: path.join(output, 'state') },
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.forge);
  await page.evaluate(async (name) => {
    const { settings } = await window.forge.state();
    await window.forge.settings({ ...settings, model: name, contextTokens: 16384, temperature: 0 });
  }, model);
  await app.evaluate(({ dialog }, workspace) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
  }, root);
  await page.evaluate(() => window.forge.openWorkspace());

  let sessionId;
  const run = async (prompt, stage) => {
    console.log('START', stage);
    const session = await page.evaluate(
      async ({ prompt, sessionId }) => {
        const handled = new Set();
        let approvalError;
        const unsub = window.forge.onEvent((event) => {
          if (event.type === 'clarification') {
            approvalError = 'Unexpected clarification: ' + event.clarification.question;
            void window.forge.stop();
          }
          if (event.type !== 'approval' || handled.has(event.approval.id)) return;
          const approval = event.approval;
          handled.add(approval.id);
          const allowed =
            (['write', 'changeset'].includes(approval.kind) &&
              (approval.change?.path === 'App.tsx' ||
                (approval.changeSet?.impact?.changed?.length === 1 &&
                  approval.changeSet.impact.changed[0] === 'App.tsx'))) ||
            (['typecheck', 'validation'].includes(approval.kind) &&
              /typescript\.check|TypeScript/i.test(approval.title)) ||
            (approval.kind === 'process' &&
              approval.title.startsWith('Start pnpm run dev (vite --host 127.0.0.1)')) ||
            (approval.kind === 'browser' &&
              /local preview http:\/\/127\.0\.0\.1:\d+\//.test(approval.title));
          if (!allowed) approvalError = 'Unexpected approval: ' + approval.title;
          void window.forge.approve(approval.id, allowed);
        });
        try {
          await window.forge.run(prompt, sessionId);
          if (approvalError) throw new Error(approvalError);
          const state = await window.forge.state();
          return state.sessions.find((item) => item.id === state.activeRun.sessionId);
        } finally {
          unsub();
        }
      },
      { prompt, sessionId },
    );
    await writeFile(path.join(output, stage + '.json'), JSON.stringify(session, null, 2));
    if (sessionId) assert.equal(session.id, sessionId);
    sessionId = session.id;
    assert.ok(
      ['completed_unverified', 'completed_verified'].includes(session.task?.outcome),
      `Stage ${stage} failed. Read ${stage}.json.`,
    );
    assert.equal(await readFile(path.join(root, 'package.json'), 'utf8'), manifest);
    console.log('PASS', stage, session.id);
    return session;
  };
  const gallery = await run(
    'Build a simple emoji gallery with search and click-to-copy. Use the project’s existing stack; no API or new packages. Inspect the project and propose a short plan first.',
    'gallery',
  );
  await writeFile(path.join(output, 'gallery-App.tsx'), await readFile(path.join(root, 'App.tsx')));
  const checked = await run(
    'Open this local project in the browser. Verify the emoji gallery search and click-to-copy in the clipboard.',
    'browser',
  );
  const receipt = JSON.parse(
    checked.messages.findLast((message) => message.name === 'browser_verify_gallery').content,
  );
  assert.equal(receipt.passed, true);
  assert.equal(receipt.copies.length, 3);
  console.log('BROWSER', JSON.stringify(receipt));
  const preview = app.windows().find((window) => /^http:\/\/127\.0\.0\.1:\d+\//.test(window.url()));
  assert.ok(preview, 'Forge must open its own BrowserWindow');
  await preview.screenshot({ path: path.join(output, 'gallery.png') });
  const button = await run(
    'Remove all existing elements from the page and leave only a single button with the text "Hello World".',
    'button',
  );
  assert.equal(button.id, gallery.id);
  await preview.reload();
  await expect(preview.getByRole('button')).toHaveCount(1);
  await expect(preview.getByRole('button', { name: 'Hello World', exact: true })).toBeVisible();
  await expect(preview.locator('body')).toHaveText('Hello World');
  await expect(preview.locator('input, img, canvas, svg, a')).toHaveCount(0);
  await preview.screenshot({ path: path.join(output, 'button.png') });
  console.log('PASS one visible Hello World button in the same Forge browser');
} finally {
  await app.close();
}
