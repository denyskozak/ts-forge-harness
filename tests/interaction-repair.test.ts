import test from 'node:test';
import assert from 'node:assert/strict';
import { missingClipboardInteraction } from '../electron/interaction-repair';
import { Agent } from '../electron/agent';
import { Store } from '../electron/store';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';

const prompt = 'Build a simple emoji gallery with click-to-copy.';
const button = '<button onClick={() => alert(emoji)}>{emoji}</button>';
const copied = '<button onClick={() => navigator.clipboard.writeText(emoji)}>{emoji}</button>';
const source = `export default function App() { return <main>{['😊', '❤️', '⭐'].map(emoji => ${button})}</main>; }`;

test('clipboard omission targets an item button, ignores comments and respects imported helpers', () => {
  const problem = missingClipboardInteraction(
    '// navigator.clipboard.writeText\n' + source,
    prompt,
  );
  assert.equal(problem?.oldText, button);
  assert.equal(problem?.kind, 'interaction');
  assert.equal(missingClipboardInteraction(source.replace(button, copied), prompt), undefined);
  assert.equal(
    missingClipboardInteraction("import { copy } from './copy';\n" + source, prompt),
    undefined,
  );
  assert.equal(missingClipboardInteraction(source, 'Remove clipboard controls.'), undefined);
  assert.equal(missingClipboardInteraction(source, 'Leave only one button.'), undefined);
});

test('a compiler pass cannot finish a self-contained page with an obviously missing copy action', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-interaction-'));
  const root = path.join(dir, 'project');
  await fs.mkdir(root);
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { react: '^19.2.0' } }),
  );
  await fs.writeFile(
    path.join(root, 'App.tsx'),
    'export default function App() { return <button>Start</button>; }',
  );
  await fs.writeFile(
    path.join(root, 'jsx.d.ts'),
    'declare module "react/jsx-runtime" { export namespace JSX { interface IntrinsicElements { [tag: string]: any; } } }',
  );
  await fs.writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, jsx: 'react-jsx' },
      include: ['*.tsx', '*.d.ts'],
    }),
  );
  let step = 0,
    repairBody = '';
  const server = createServer(async (req, res) => {
    if (req.url === '/api/tags') return res.end('{"models":[{"name":"local","size":1}]}');
    if (req.url === '/api/show') return res.end('{}');
    let body = '';
    for await (const chunk of req) body += chunk;
    const index = step++;
    let message: object;
    if (index === 0)
      message = {
        content: '',
        tool_calls: [
          {
            function: {
              name: 'plan_task',
              arguments: {
                goal: prompt,
                criteria: ['Click copies an emoji'],
                requiredChecks: [{ recipe: 'typescript.check' }],
              },
            },
          },
        ],
      };
    else if (index === 1) {
      assert.equal(JSON.parse(body).format, undefined);
      message = { content: '```tsx\n' + source + '\n```' };
    } else if (index === 2) {
      repairBody = body;
      message = { content: JSON.stringify({ replacement: copied, path: 'elsewhere.tsx' }) };
    } else message = { content: 'Done' };
    res.end(JSON.stringify({ done: true, done_reason: 'stop', message }) + '\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const store = new Store(path.join(dir, 'state'));
  await store.load();
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  store.value.workspacePath = root;
  store.value.settings = {
    ...store.value.settings,
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    model: 'local',
    mapFormat: 'compact',
  };
  let approvals = 0;
  const errors: string[] = [];
  const agent = new Agent(store, (event) => {
    if (event.type === 'approval') {
      approvals++;
      agent.approve(event.approval.id, true);
    }
    if (event.type === 'clarification') agent.stop();
    if (event.type === 'error') errors.push(event.error);
  });
  await agent.run(prompt);
  assert.deepEqual(errors, []);
  // Declared checks are executed by Forge around the model-generated repair.
  assert.equal(step, 3);
  assert.equal(approvals, 4);
  assert.match(repairBody, /missing UI interactions/);
  assert.deepEqual(JSON.parse(repairBody).format.required, ['replacement']);
  assert.equal(
    await fs.readFile(path.join(root, 'App.tsx'), 'utf8'),
    source.replace(button, copied) + '\n',
  );
  await assert.rejects(fs.stat(path.join(root, 'elsewhere.tsx')));
  assert.equal(
    store.value.sessions[0].task?.validations.filter((v) => v.status === 'passed').length,
    2,
  );
  assert.equal(store.value.sessions[0].task?.outcome, 'completed_unverified');
});
