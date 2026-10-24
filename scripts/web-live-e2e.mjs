/** Real Ollama + external web requests + Electron UI. Uses an isolated temporary workspace. */
import { _electron as electron, expect } from '@playwright/test';
import electronPath from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const endpoint = process.env.FORGE_E2E_ENDPOINT ?? 'http://127.0.0.1:11434';
const model = process.env.FORGE_E2E_MODEL ?? 'llama3.1:8b';
const tags = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) }).then((r) =>
  r.json(),
);
assert.ok(
  tags.models.some((m) => m.name === model),
  `Local model unavailable: ${model}`,
);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-web-live-'));
const root = path.join(temp, 'workspace');
await fs.mkdir(root);
await fs.writeFile(path.join(root, 'index.ts'), 'export const fixture = true;\n');
const output = path.resolve('.forge-test-results', `web-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
console.log(`Report: ${output}`);
const app = await electron.launch({
  executablePath: electronPath,
  args: ['.'],
  env: { ...process.env, NODE_ENV: 'test', FORGE_TEST_DATA: path.join(temp, 'state') },
});
const report = { model, endpoint, approvals: [], errors: [], passed: false };
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.waitForFunction(() => !!window.forge);
  await page.screenshot({ path: path.join(output, 'initial.png') });
  await page.evaluate(
    async ({ endpoint, model }) => {
      const state = await window.forge.state();
      await window.forge.settings({
        ...state.settings,
        endpoint,
        model,
        skills: ['typescript'],
        contextTokens: 16384,
        maxSteps: 8,
        temperature: 0,
        webSearch: { enabled: true, allowedDomains: ['react.dev'] },
      });
    },
    { endpoint, model },
  );
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
  }, root);
  await page.evaluate(() => window.forge.openWorkspace());
  await page.reload();
  await page
    .getByRole('textbox', { name: 'Message Forge' })
    .fill(
      'Найди в интернете официальную документацию React useEffect cleanup через web_search. Затем прочитай https://react.dev/reference/react/useEffect через web_read. Кратко объясни cleanup на русском и дай ссылку. Не меняй файлы и не запускай команды. Используй оба инструмента, не отвечай по памяти.',
    );
  await page.getByRole('button', { name: 'Run task' }).click();
  const deadline = Date.now() + 300000;
  let started = false;
  let last = '';
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.forge.state());
    const run = state.activeRun;
    if (run) started = true;
    const status = JSON.stringify({
      status: run?.status,
      approval: run?.approval?.title,
      messages: state.sessions.at(-1)?.messages.length,
    });
    if (status !== last) {
      console.log(status);
      last = status;
    }
    if (run?.approval) {
      assert.equal(run.approval.kind, 'web_search', 'Unexpected operation requested');
      report.approvals.push(run.approval.title);
      await page.screenshot({ path: path.join(output, `approval-${report.approvals.length}.png`) });
      await page
        .getByRole('button', {
          name: run.approval.title.startsWith('Read web page ') ? 'Read page' : 'Search web',
          exact: true,
        })
        .click();
    }
    if (started && run && !['running', 'waiting'].includes(run.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  report.state = await page.evaluate(() => window.forge.state());
  assert.ok(
    !['running', 'waiting'].includes(report.state.activeRun?.status),
    'Scenario did not finish before deadline',
  );
  await page.screenshot({ path: path.join(output, 'chat.png'), fullPage: true });
  report.visible = await page.locator('body').innerText();
  const messages = report.state.sessions.flatMap((s) => s.messages);
  for (const name of ['web_search', 'web_read']) {
    const result = messages.find((m) => m.role === 'tool' && m.name === name);
    assert.ok(result, `Missing ${name}`);
    assert.ok(!result.content.startsWith('Tool error:'), result.content);
    const data = JSON.parse(result.content);
    if (name === 'web_search') assert.ok(data.results.length, 'Search returned no results');
    else assert.ok(data.content.length > 100, 'Page returned no useful text');
  }
  await expect(page.getByText('Web page read', { exact: true })).toBeVisible();
  assert.doesNotMatch(report.visible, /"trust"\s*:|"results"\s*:|"tool_calls"\s*:/);
  assert.equal(report.errors.length, 0);
  assert.doesNotMatch(report.visible, /import\s+\{|function ChatRoom|```/);
  assert.equal(
    await fs.readFile(path.join(root, 'index.ts'), 'utf8'),
    'export const fixture = true;\n',
  );
  assert.ok(
    messages.some(
      (m) =>
        m.role === 'assistant' &&
        /cleanup|очистк/i.test(m.content) &&
        m.content.includes('https://react.dev/reference/react/useEffect'),
    ),
  );
  report.passed = true;
} catch (error) {
  report.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await app.close();
  await fs.rm(temp, { recursive: true, force: true });
}
