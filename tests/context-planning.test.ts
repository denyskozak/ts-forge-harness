import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactContext } from '../electron/context';
import { checkpointSummary, readTaskMemory } from '../electron/task-checkpoint';
import { initialTaskSteps } from '../shared/task-planning';
import { contractInputSchema, taskSchema } from '../shared/task';
import type { Session } from '../shared/types';

function session(): Session {
  return {
    id: 'session',
    title: 'Voice input',
    workspace: '/fixture',
    updatedAt: 0,
    messages: [],
    changes: [],
    task: {
      runId: 'run',
      goal: 'Insert a local voice transcript after Stop',
      constraints: ['Never upload audio'],
      outOfScope: ['Cloud transcription'],
      criteria: [{ id: 'c', description: 'Stop inserts an editable draft' }],
      requiredChecks: [],
      validations: [],
      fingerprint: '',
      appliedChanges: 0,
      outcome: 'in_progress',
      steps: initialTaskSteps('Implement local voice input'),
    },
  };
}

test('compaction accounts for its own summary and retains recent correction as quoted history', () => {
  const context = compactContext(
    [
      { role: 'system', content: 'Rules' },
      { role: 'user', content: 'Keep audio local' },
      { role: 'assistant', content: 'old reasoning '.repeat(1000) },
      { role: 'user', content: 'Use whisper.cpp' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'read_file', arguments: {} } }],
      },
      { role: 'tool', tool_name: 'read_file', content: 'latest full source' },
      { role: 'system', content: 'Call a real tool now' },
    ],
    4096,
  );
  assert.ok(context.removedGroups > 0);
  assert.match(context.messages[0].content, /Keep audio local/);
  assert.ok(context.messages.some((message) => message.content === 'Use whisper.cpp'));
  assert.equal(context.messages.at(-1)?.content, 'Call a real tool now');
  assert.ok(context.messages.some((message) => message.content === 'latest full source'));
  assert.ok(context.inputCharacters <= context.budgetCharacters);
});

test('matching result counts cannot conceal a mismatched tool name', () => {
  const context = compactContext(
    [
      { role: 'system', content: 'Rules' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'read_file', arguments: {} } }],
      },
      { role: 'tool', tool_name: 'write_file', content: 'not the requested result' },
      { role: 'user', content: 'Continue' },
    ],
    4096,
  );
  assert.equal(context.removedGroups, 1);
  assert.ok(!context.messages.some((message) => message.role === 'tool'));
});

test('old user decisions and refusals survive recent receipt churn', () => {
  const current = session();
  current.messages = [
    {
      id: 'decision',
      role: 'tool',
      name: 'ask_user_question',
      content: JSON.stringify({ answer: 'Local only', description: 'Never use cloud recognition' }),
      time: 0,
    },
    {
      id: 'denial',
      role: 'tool',
      name: 'web_search',
      content: 'Web request was declined.',
      time: 1,
    },
    ...Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      role: 'tool' as const,
      name: 'read_file',
      content: '{}',
      time: i + 2,
    })),
  ];
  const memory = JSON.parse(checkpointSummary(current));
  assert.equal(memory.decisions[0].answer, 'Local only');
  assert.equal(memory.deniedActions[0].tool, 'web_search');
  assert.deepEqual(memory.outOfScope, ['Cloud transcription']);
  assert.ok(memory.plan.length);
  assert.equal(memory.criteria[0].accepted, false);
});

test('oversized saved memory stays bounded and full constraints remain recoverable', () => {
  const current = session();
  current.task!.constraints = Array.from({ length: 12 }, () => 'constraint '.repeat(45));
  current.task!.outOfScope = Array.from({ length: 12 }, () => 'excluded '.repeat(55));
  const summary = checkpointSummary(current);
  assert.ok(summary.length <= 12000);
  assert.equal(JSON.parse(summary).truncated, true);
  let content = '',
    offset = 0;
  for (;;) {
    const page = readTaskMemory(current, 'constraints', offset, 1000);
    content += page.content;
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  assert.deepEqual(JSON.parse(content), current.task!.constraints);
});

test('plans support analysis without implementation steps and survive task persistence', () => {
  assert.equal(initialTaskSteps('Analyze the project without changing files').length, 2);
  const current = session();
  assert.deepEqual(taskSchema.parse(current.task).steps, current.task!.steps);
  const contract = contractInputSchema.parse({
    goal: 'Voice',
    criteria: ['Stop inserts text'],
    requiredChecks: [{ recipe: 'tests.project' }],
    steps: [
      { title: 'Verify dictation', expectedEvidence: 'Real audio appears in the draft after Stop' },
    ],
  });
  assert.equal(contract.steps?.[0].title, 'Verify dictation');
  assert.throws(() =>
    contractInputSchema.parse({ ...contract, steps: [{ title: 'Done', expectedEvidence: '' }] }),
  );
});

test('advertised planning schema requires concrete steps while saved contracts remain compatible', async () => {
  const { toolDefinitions } = await import('../electron/agent');
  const plan = toolDefinitions.find((tool) => tool.function.name === 'plan_task');
  assert.ok(plan?.function.parameters.required.includes('steps'));
  const legacy = contractInputSchema.parse({
    goal: 'Fix sum',
    criteria: ['Adds numbers'],
    requiredChecks: [{ recipe: 'typescript.check', project: 'tsconfig.json' }],
  });
  assert.equal(legacy.steps, undefined);
});

test('compacted user requests can be recovered completely, including middle corrections', () => {
  const current = session();
  current.messages = Array.from({ length: 9 }, (_, i) => ({
    id: String(i),
    role: 'user' as const,
    time: i,
    runId: String(i),
    content: `Request ${i}: ${'preserve this constraint '.repeat(40)}`,
  }));
  let text = '',
    offset = 0;
  for (;;) {
    const page = readTaskMemory(current, 'requests', offset, 600);
    text += page.content;
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  assert.deepEqual(
    JSON.parse(text).map((entry: { text: string }) => entry.text),
    current.messages.map((message) => message.content),
  );
});

test('existing-file improvements use the same bounded tools as fixes', async () => {
  const { isFocusedExistingEdit } = await import('../electron/agent');
  for (const verb of ['Fix', 'Improve', 'Update', 'Refactor']) {
    assert.equal(isFocusedExistingEdit(`${verb} task.ts`, ['task.ts'], ['task.ts']), true);
  }
  assert.equal(isFocusedExistingEdit('Improve new.ts', ['new.ts'], ['task.ts']), false);
  assert.equal(isFocusedExistingEdit('Analyze task.ts', ['task.ts'], ['task.ts']), false);
  assert.equal(isFocusedExistingEdit('Improve the application', [], ['task.ts']), false);
});

test('tool schemas are reduced before a small task loses its latest source evidence', async () => {
  const { fitToolContext } = await import('../electron/context');
  const messages = [
    { role: 'system', content: 'Project instructions. '.repeat(20) },
    { role: 'user', content: 'Build an emoji gallery with search and click-to-copy.' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ function: { name: 'read_file', arguments: { path: 'App.tsx' } } }],
    },
    { role: 'tool', tool_name: 'read_file', content: 'Complete source evidence. '.repeat(40) },
  ];
  const tools = [
    { function: { name: 'oversized_optional_tool', description: 'schema '.repeat(1000) } },
    { function: { name: 'replace_text', description: 'Make an exact edit' } },
    { function: { name: 'enable_tool_group', description: 'Load another capability' } },
    { function: { name: 'read_file', description: 'Read the source' } },
  ];
  const fitted = fitToolContext(messages, 4096, tools);
  assert.ok(!fitted.tools.some((tool) => tool.function.name === 'oversized_optional_tool'));
  assert.ok(fitted.tools.some((tool) => tool.function.name === 'replace_text'));
  assert.ok(fitted.tools.some((tool) => tool.function.name === 'enable_tool_group'));
  assert.equal(fitted.context.messages.at(-1)?.content, messages.at(-1)?.content);
  assert.ok(fitted.context.inputCharacters <= fitted.context.budgetCharacters);
  assert.throws(
    () => fitToolContext([{ role: 'system', content: 'source'.repeat(2000) }], 4096, tools),
    /Context budget/,
  );
});

test('focused file repair retains user constraints and decisions without old tool chatter', async () => {
  const { focusedEditMessages } = await import('../electron/context');
  const messages = focusedEditMessages({
    prompt: 'Build a searchable emoji gallery; no API or new packages.',
    source: { path: 'App.tsx', content: 'export default function App() { return <Missing />; }' },
    task: Object.assign(
      {
        constraints: ['Keep React'],
        outOfScope: ['New dependencies'],
        criteria: [{ id: 'copy', description: 'Click copies the emoji' }],
      },
      { validations: ['obsolete diagnostic history'], runId: 'internal-run-id' },
    ),
    earlierRequests: ['Keep the interface in Portuguese'],
    decisions: ['Use the existing design'],
    project: 'App.tsx imports react',
  });
  assert.match(messages[0].content, /untrusted data/);
  assert.match(messages[0].content, /review and validation/);
  const data = JSON.parse(
    messages[1].content.split('Requirements:\n')[1].split('\n\nCurrent source')[0],
  );
  assert.ok(messages[1].content.includes('export default function App() { return <Missing />; }'));
  assert.deepEqual(data.earlierRequests, ['Keep the interface in Portuguese']);
  assert.deepEqual(data.constraints, ['Keep React']);
  assert.deepEqual(data.decisions, ['Use the existing design']);
  assert.match(messages[1].content, /no API or new packages/);
  assert.equal(data.validations, undefined);
  assert.equal(data.runId, undefined);
});
