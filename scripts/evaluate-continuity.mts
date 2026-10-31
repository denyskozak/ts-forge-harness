/** Live Ollama regression: real sequential edits, no injected transcript or solution. */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Store } from '../electron/store';
import { Agent } from '../electron/agent';
import { models } from '../electron/provider';
import { verifyFixture } from './acceptance';

const model = process.env.FORGE_EVAL_MODEL ?? 'llama3.1:8b';
const endpoint = process.env.FORGE_EVAL_ENDPOINT ?? 'http://127.0.0.1:11434';
const contextTokens = Number(process.env.FORGE_EVAL_CONTEXT_TOKENS ?? 12288);
const destination = path.resolve(
  process.env.FORGE_EVAL_REPORT ?? '.forge-test-results/continuity.json',
);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-continuity-'));
const project = path.join(temp, 'project');
const store = new Store(path.join(temp, 'state'));
const results: Record<string, unknown>[] = [];
const contextSamples: unknown[] = [];
let failure = '';
let digest = '';
const base = 'assert.equal(sum([]),0);assert.equal(sum([2,3,-1]),4);';
const turns = [
  {
    prompt:
      'Fix sum in task.ts to add numeric values, returning zero for an empty array. Preserve both exported signatures and leave label unchanged. Change only task.ts. Read it, plan the edit, apply it and run typescript.check for tsconfig.json.',
    checks: base,
  },
  {
    prompt:
      'Now fix label in task.ts: null returns an empty string and strings are trimmed. Preserve sum behavior and both exported signatures. Change only task.ts. Apply the edit and validate tsconfig.json.',
    checks: base + 'assert.equal(label(null),"");assert.equal(label(" a "),"a");',
  },
  {
    prompt:
      'Improve sum in task.ts to ignore NaN values while keeping negative and fractional finite values. Preserve label behavior and both exported signatures. Change only task.ts. Apply the edit and validate tsconfig.json.',
    checks:
      base +
      'assert.equal(sum([NaN,2.5,-1]),1.5);assert.equal(label(null),"");assert.equal(label(" a "),"a");',
  },
  {
    prompt:
      'Improve label in task.ts to collapse consecutive internal whitespace to a single space as well as trim it. Preserve its null behavior, sum behavior including ignoring NaN, and both exported signatures. Change only task.ts. Apply the edit and validate tsconfig.json.',
    checks:
      base +
      'assert.equal(sum([NaN,2.5,-1]),1.5);assert.equal(label(null),"");assert.equal(label(" a  b\\t c "),"a b c");',
  },
];
try {
  const installed = (await models(endpoint)).find((item) => item.name === model);
  assert.ok(installed, `Ollama model ${model} is unavailable`);
  digest = installed.digest ?? '';
  await fs.mkdir(project);
  await fs.writeFile(
    path.join(project, 'task.ts'),
    'export function sum(values: number[]): number { return values.length; }\nexport function label(value: string | null): string { return String(value); }\n',
  );
  const config = JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', noEmit: true },
    include: ['task.ts'],
  });
  await fs.writeFile(path.join(project, 'tsconfig.json'), config);
  await store.load();
  store.value.workspacePath = project;
  store.value.settings = {
    ...store.value.settings,
    model,
    endpoint,
    contextTokens,
    temperature: 0,
    maxSteps: 8,
    mapFormat: 'compact',
  };
  for (const [index, turn] of turns.entries()) {
    const errors: string[] = [];
    let timedOut = false;
    let clarification = false;
    let approvals = 0;
    const agent = new Agent(store, (event) => {
      const context = store.value.sessions[0]?.checkpoint?.context;
      if (context) contextSamples.push({ turn: index + 1, ...context });
      if (event.type === 'approval') {
        approvals++;
        agent.approve(
          event.approval.id,
          ['write', 'changeset', 'typecheck', 'validation'].includes(event.approval.kind),
        );
      }
      if (event.type === 'clarification') {
        clarification = true;
        queueMicrotask(() => agent.stop());
      }
      if (event.type === 'error') errors.push(event.error);
    });
    const start = Date.now();
    const timer = setTimeout(
      () => {
        timedOut = true;
        agent.stop();
      },
      Number(process.env.FORGE_EVAL_TIMEOUT_MS ?? 240000),
    );
    try {
      await agent.run(turn.prompt, store.value.sessions[0]?.id);
    } catch (error) {
      errors.push(String(error));
    } finally {
      clearTimeout(timer);
    }
    let acceptancePassed = false;
    let acceptanceError = '';
    try {
      await verifyFixture(project, path.join(temp, `check-${index}`), turn.checks);
      assert.equal(await fs.readFile(path.join(project, 'tsconfig.json'), 'utf8'), config);
      assert.deepEqual((await fs.readdir(project)).filter((name) => name !== '.forge').sort(), [
        'task.ts',
        'tsconfig.json',
      ]);
      acceptancePassed = true;
    } catch (error) {
      acceptanceError = String(error);
    }
    const session = store.value.sessions[0];
    const outcome = session?.task?.outcome;
    const delivered = outcome === 'completed_verified' || outcome === 'completed_unverified';
    const passed = acceptancePassed && delivered && !timedOut && !clarification && !errors.length;
    results.push({
      turn: index + 1,
      prompt: turn.prompt,
      passed,
      acceptancePassed,
      acceptanceError,
      outcome,
      timedOut,
      clarification,
      approvals,
      errors,
      durationMs: Date.now() - start,
      plan: session?.task?.steps,
      context: session?.checkpoint?.context,
      source: await fs.readFile(path.join(project, 'task.ts'), 'utf8'),
    });
    await save();
    console.log(`${passed ? 'PASS' : 'FAIL'} turn ${index + 1}: ${outcome}`);
    if (timedOut || clarification || errors.length) break;
  }
} catch (error) {
  failure = String(error);
} finally {
  await save();
  await store.close();
  await fs.rm(temp, { recursive: true, force: true });
}
async function save() {
  const compacted = contextSamples.some(
    (sample) => (sample as { removedGroups: number }).removedGroups > 0,
  );
  const passed =
    !failure &&
    results.length === turns.length &&
    results.every((result) => result.passed) &&
    compacted;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(
    destination,
    JSON.stringify(
      {
        model,
        digest,
        contextTokens,
        failure,
        passed,
        compacted,
        scope:
          'Four real sequential TypeScript edits in one session with a deliberately constrained context. No synthetic messages or manual solving. Not a framework or UI benchmark.',
        results,
        contextSamples,
        transcript: store.value.sessions[0]?.messages,
      },
      null,
      2,
    ),
  );
  process.exitCode = passed ? 0 : 1;
}
console.log(destination);
