import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Agent } from '../electron/agent';
import { Store } from '../electron/store';

const prompts = [
  'Build a simple emoji gallery with search and click-to-copy. Use the project’s existing stack; no API or new packages. Inspect the project and propose a short plan first.',
  'Remove all existing elements from the page and leave only a single button with the text "Hello World".',
];
for (const prompt of prompts) {
  test(`a mistaken JavaScript edit recovers for: ${prompt}`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-simple-recovery-'));
    const project = path.join(directory, 'project');
    await fs.mkdir(project);
    const original = 'document.body.textContent = "Starter page";\n';
    const updated = "document.body.innerHTML = '<button>Hello World</button>';\n";
    await fs.writeFile(path.join(project, 'main.ts'), original);
    await fs.writeFile(
      path.join(project, 'index.html'),
      '<script type="module" src="/main.ts"></script>',
    );
    await fs.writeFile(
      path.join(project, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ['main.ts'] }),
    );
    let step = 0;
    let firstContext = '';
    let repairFormat = '';
    let validationRepairContext = '';
    let malformedContentSent = false;
    let sourceAfterMalformed = '';
    let noOpRecoverySchema = '';
    const broken = 'missingComponent();\n';
    const calls = [
      {
        name: 'plan_task',
        arguments: {
          goal: prompt,
          criteria: [prompt],
          requiredChecks: [{ recipe: 'typescript.check' }],
        },
      },
      {
        name: 'apply_changeset',
        arguments: {
          rationale: 'Mistaken model filenames',
          edits: [
            { path: 'unused.ts', content: 'export {};' },
            { path: 'app.js', content: 'document.body.textContent = "Wrong";' },
          ],
        },
      },
      { name: 'replace_text', arguments: { oldText: original, newText: broken } },
      { name: 'replace_text', arguments: { path: 'main.ts', oldText: original, newText: broken } },
      { name: 'run_validation', arguments: { recipe: 'typescript.check' } },
      { name: 'write_file', arguments: { path: 'main.ts', content: updated } },
      {
        name: 'replace_text',
        arguments: { path: 'main.ts', oldText: 'missingComponent();', newText: updated.trim() },
      },
      { name: 'run_validation', arguments: { recipe: 'typescript.check' } },
    ];
    const server = createServer(async (req, res) => {
      if (req.url === '/api/tags')
        return res.end(JSON.stringify({ models: [{ name: 'local', size: 1 }] }));
      if (req.url === '/api/show') return res.end('{}');
      let body = '';
      for await (const chunk of req) body += chunk;
      if (!step) firstContext = body;
      if (step === 3) repairFormat = JSON.stringify(JSON.parse(body).format);
      if (step === 5) validationRepairContext = body;
      if (step === 6) noOpRecoverySchema = JSON.stringify(JSON.parse(body).format);
      if (step === 5) {
        if (!malformedContentSent) {
          malformedContentSent = true;
          return res.end(
            JSON.stringify({ done: true, message: { content: '{"content":"truncated source' } }) +
              '\n',
          );
        }
        sourceAfterMalformed = await fs.readFile(path.join(project, 'main.ts'), 'utf8');
        step++;
        return res.end(
          JSON.stringify({
            done: true,
            message: { content: JSON.stringify({ path: 'elsewhere.ts', content: broken }) },
          }) + '\n',
        );
      }
      const call = calls[step++];
      res.end(
        JSON.stringify({
          done: true,
          message: call
            ? { content: '', tool_calls: [{ function: call }] }
            : { content: 'Applied the edit and ran the TypeScript check.' },
        }) + '\n',
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const store = new Store(path.join(directory, 'state'));
    await store.load();
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await store.close();
      await fs.rm(directory, { recursive: true, force: true });
    });
    store.value.workspacePath = project;
    store.value.settings = {
      ...store.value.settings,
      model: 'local',
      mapFormat: 'compact',
      endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    };
    const errors: string[] = [];
    let approvals = 0;
    const agent = new Agent(store, (event) => {
      if (event.type === 'approval') {
        approvals++;
        agent.approve(event.approval.id, true);
      }
      if (event.type === 'error') errors.push(event.error);
      if (event.type === 'clarification') agent.stop();
    });
    await agent.run(prompt);
    // This is a harness recovery test; live evaluation separately checks generated app behavior.
    assert.match(firstContext, /Starter page/);
    assert.match(validationRepairContext, /Cannot find name/);
    assert.match(validationRepairContext, /real implementation/);
    assert.match(validationRepairContext, /missingComponent/);
    assert.match(validationRepairContext, /complete corrected source file/);
    assert.match(validationRepairContext, /previous response was incomplete or invalid source/);
    assert.equal(sourceAfterMalformed, broken, 'incomplete output must never reach the filesystem');
    assert.match(noOpRecoverySchema, /"const":"replace_text"/);
    assert.doesNotMatch(noOpRecoverySchema, /"const":"write_file"/);
    assert.match(repairFormat, /"const":"replace_text"/);
    assert.doesNotMatch(repairFormat, /"const":"plan_task"/);
    assert.equal(await fs.readFile(path.join(project, 'main.ts'), 'utf8'), updated);
    await assert.rejects(fs.stat(path.join(project, 'app.js')));
    await assert.rejects(fs.stat(path.join(project, 'unused.ts')));
    await assert.rejects(fs.stat(path.join(project, 'elsewhere.ts')));
    assert.deepEqual(errors, []);
    assert.equal(approvals, 4, 'only valid edits and their checks reach approval');
    const session = store.value.sessions[0];
    assert.equal(session.task?.outcome, 'completed_unverified');
    assert.ok(
      session.messages.some(
        (m) => m.name === 'apply_changeset' && m.content.startsWith('Tool error:'),
      ),
    );
    assert.equal(session.task?.validations.at(-1)?.status, 'passed');
  });
}

test('small React page edits have a concrete target without guessing in larger projects', async () => {
  const { simpleReactEditTarget } = await import('../electron/agent');
  for (const prompt of prompts)
    assert.equal(
      simpleReactEditTarget(prompt, ['src/main.tsx', 'src/App.tsx'], ['React', 'Vite']),
      'src/App.tsx',
    );
  assert.equal(simpleReactEditTarget(prompts[0], ['App.tsx', 'src/App.tsx'], ['React']), undefined);
  assert.equal(
    simpleReactEditTarget(prompts[0], ['App.tsx', 'a.ts', 'b.ts', 'c.ts', 'd.ts'], ['React']),
    undefined,
  );
  assert.equal(
    simpleReactEditTarget(
      'Change src/Other.tsx to a single button',
      ['App.tsx', 'src/Other.tsx'],
      ['React'],
    ),
    undefined,
  );
  assert.equal(simpleReactEditTarget('Build a simple API', ['App.tsx'], ['React']), undefined);
});
