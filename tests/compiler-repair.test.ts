import test from 'node:test';
import assert from 'node:assert/strict';
import { compilerExcerpt } from '../electron/compiler-repair';
import { Agent } from '../electron/agent';
import { Store } from '../electron/store';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';

test('compiler excerpts use exact source lines and reject ambiguous or invalid ranges', () => {
  const source = 'one\r\ntwo\r\nthree\r\nfour\r\nfive\r\nsix\r\nseven';
  assert.deepEqual(compilerExcerpt(source, 4), {
    startLine: 2,
    oldText: 'two\r\nthree\r\nfour\r\nfive\r\nsix\r',
  });
  assert.equal(compilerExcerpt(source, 0), undefined);
  assert.equal(compilerExcerpt(source, 8), undefined);
  assert.equal(compilerExcerpt('same\n'.repeat(20), 8), undefined);
  const handler =
    'const copy = (value) => {\n  try {\n    console.log(value);\n  } catch (error) {\n    console.error(error);\n  }\n};';
  assert.deepEqual(compilerExcerpt(handler + '\nconst tail = 1;', 1, true), {
    oldText: handler,
    startLine: 1,
  });
});

test('compiler repair constrains the model to an exact excerpt and preserves the file tail', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-compiler-repair-'));
  const root = path.join(directory, 'project');
  await fs.mkdir(root);
  const original = 'export function label(value: string) { return value; }';
  const broken = 'export function label(value) { return value.trim(); }';
  const corrected = 'export function label(value: string) { return value.trim(); }';
  const tail = '\n'.repeat(8) + 'export const unrelated = 123;\n';
  await fs.writeFile(path.join(root, 'index.ts'), original + tail);
  await fs.writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, files: ['index.ts'] }),
  );
  let step = 0,
    repairRequest = '';
  const calls = [
    {
      name: 'plan_task',
      arguments: {
        goal: 'Trim strings',
        criteria: ['label trims strings'],
        requiredChecks: [{ recipe: 'typescript.check' }],
      },
    },
    { name: 'read_file', arguments: { path: 'index.ts' } },
    { name: 'replace_text', arguments: { path: 'index.ts', oldText: original, newText: broken } },
    { name: 'run_validation', arguments: { recipe: 'typescript.check' } },
  ];
  const server = createServer(async (req, res) => {
    if (req.url === '/api/tags') return res.end('{"models":[{"name":"local","size":1}]}');
    if (req.url === '/api/show') return res.end('{}');
    let body = '';
    for await (const chunk of req) body += chunk;
    const current = step++;
    if (current === 4) {
      repairRequest = body;
      res.end(
        JSON.stringify({
          done: true,
          message: {
            content: JSON.stringify({
              path: 'elsewhere.ts',
              replacement: compilerExcerpt(broken + tail, 1, true)!.oldText.replace(
                broken,
                corrected,
              ),
            }),
          },
        }) + '\n',
      );
    } else {
      const call = calls[current] ?? {
        name: 'run_validation',
        arguments: { recipe: 'typescript.check' },
      };
      res.end(
        JSON.stringify({ done: true, message: { content: '', tool_calls: [{ function: call }] } }) +
          '\n',
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const store = new Store(path.join(directory, 'state'));
  await store.load();
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  store.value.workspacePath = root;
  store.value.settings = {
    ...store.value.settings,
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    model: 'local',
    mapFormat: 'compact',
  };
  let approvals = 0;
  const agent = new Agent(store, (event) => {
    if (event.type === 'approval') {
      approvals++;
      agent.approve(event.approval.id, true);
    }
    if (event.type === 'clarification') agent.stop();
  });
  await agent.run('Update label in index.ts to trim strings. Preserve its signature.');
  assert.match(repairRequest, /implicitly has an 'any' type/);
  assert.match(repairRequest, /corrected excerpt only/);
  assert.deepEqual(JSON.parse(repairRequest).format.required, ['replacement']);
  assert.doesNotMatch(JSON.stringify(JSON.parse(repairRequest).messages), /unrelated = 123/);
  assert.equal(await fs.readFile(path.join(root, 'index.ts'), 'utf8'), corrected + tail);
  await assert.rejects(fs.stat(path.join(root, 'elsewhere.ts')));
  assert.equal(approvals, 4);
  assert.equal(store.value.sessions[0].task?.validations.at(-1)?.status, 'passed');
});
