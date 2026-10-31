import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Agent } from '../electron/agent';
import { Store } from '../electron/store';
import type { AgentEvent } from '../shared/types';
import {
  isAccidentalInput,
  hasMeaningfulClarification,
  TASK_DESCRIPTION_HINT,
  INVALID_QUESTION_HINT,
} from '../shared/clarification-quality';

test('only obvious standalone keyboard noise gets the no-inference shortcut', () => {
  for (const prompt of ['qweqwe', ' QWEQWE ', 'asdasd', 'йцуйцу'])
    assert.equal(isAccidentalInput(prompt), true);
  for (const prompt of [
    'fix qweqwe.ts',
    'qweqwe.ts',
    'React',
    'да',
    'continue',
    'привет',
    'SQL',
    'x => x',
    'abcdef',
  ])
    assert.equal(isAccidentalInput(prompt), false);
});

test('questions reject placeholders, duplicate answers and echoed user input', () => {
  const real = [{ label: 'SQLite' }, { label: 'PostgreSQL' }, { label: 'In-memory only' }];
  assert.equal(
    hasMeaningfulClarification('Which storage should we use?', real, 'Build a store'),
    true,
  );
  for (const labels of [
    ['option1', 'option2', 'option3'],
    ['Вариант 1', 'Вариант 2', 'Вариант 3'],
    ['A', 'B', 'C'],
    ['SQLite', ' sqlite ', 'PostgreSQL'],
  ]) {
    assert.equal(
      hasMeaningfulClarification(
        'Choose storage',
        labels.map((label) => ({ label })),
        'Build a store',
      ),
      false,
    );
  }
  assert.equal(hasMeaningfulClarification('Build a store?', real, 'Build a store'), false);
});

test('keyboard noise finishes without model requests, project scans or a blocking question', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-input-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(path.join(root, 'state'));
  await store.load();
  t.after(() => store.close());
  store.value.workspacePath = root;
  store.value.settings.model = 'unavailable:model';
  store.value.settings.endpoint = 'http://127.0.0.1:1';
  const events: AgentEvent[] = [];
  const agent = new Agent(store, (event) => events.push(event));
  await agent.run('qweqwe');
  assert.equal(agent.busy, false);
  assert.equal(store.value.activeRun?.status, 'completed');
  assert.equal(store.value.sessions[0].messages.at(-1)?.content, TASK_DESCRIPTION_HINT);
  assert.ok(
    !events.some((event) => ['error', 'map', 'approval', 'clarification'].includes(event.type)),
  );
  assert.ok(!store.value.sessions[0].messages.some((message) => message.toolCalls?.length));
});

for (const malformed of ['short-reason', 'placeholder-options', 'echo-question']) {
  test(`invalid clarification (${malformed}) stops before exposing tool errors or running siblings`, async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-question-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const project = path.join(root, 'project');
    await fs.mkdir(project);
    await fs.writeFile(path.join(project, 'index.ts'), 'export const value = 1;');
    let generations = 0;
    const prompt = 'Discuss storage choices';
    const server = createServer((req, res) => {
      req.resume();
      if (req.url === '/api/tags')
        return res.end(JSON.stringify({ models: [{ name: 'test:local', size: 1 }] }));
      if (req.url === '/api/show') return res.end('{}');
      generations++;
      res.end(
        JSON.stringify({
          done: true,
          message: {
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'ask_user_question',
                  arguments: {
                    question:
                      malformed === 'echo-question' ? prompt : 'Which storage should we use?',
                    reason:
                      malformed === 'short-reason'
                        ? ''
                        : 'Storage changes the persistence implementation.',
                    options:
                      malformed === 'placeholder-options'
                        ? ['option1', 'option2', 'option3']
                        : ['SQLite', 'PostgreSQL', 'In-memory only'],
                  },
                },
              },
              {
                function: {
                  name: 'write_file',
                  arguments: { path: 'index.ts', content: 'BROKEN' },
                },
              },
            ],
          },
        }) + '\n',
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    const store = new Store(path.join(root, 'state'));
    await store.load();
    t.after(() => store.close());
    store.value.workspacePath = project;
    store.value.settings = {
      ...store.value.settings,
      model: 'test:local',
      mapFormat: 'compact',
      endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    };
    const events: AgentEvent[] = [];
    await new Agent(store, (event) => events.push(event)).run(prompt);
    assert.equal(generations, 1);
    assert.equal(
      await fs.readFile(path.join(project, 'index.ts'), 'utf8'),
      'export const value = 1;',
    );
    assert.ok(!events.some((event) => ['clarification', 'approval', 'error'].includes(event.type)));
    assert.equal(store.value.sessions[0].messages.at(-1)?.content, INVALID_QUESTION_HINT);
    assert.ok(
      !store.value.sessions[0].messages.some(
        (message) => message.role === 'tool' || message.toolCalls?.length,
      ),
    );
    assert.equal(store.value.activeRun?.status, 'stopped');
  });
}
