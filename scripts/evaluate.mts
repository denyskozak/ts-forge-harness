/** Real local-model baseline. Auto-approval is confined to generated temporary fixtures. */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { verifyFixture } from './acceptance';
import { evalMetrics, type Intervention } from '../shared/eval-metrics';
import { execFileSync } from 'node:child_process';
import { Store } from '../electron/store';
import { Agent } from '../electron/agent';
import { models } from '../electron/provider';
const endpoint = process.env.FORGE_EVAL_ENDPOINT ?? 'http://127.0.0.1:11434';
const model = process.env.FORGE_EVAL_MODEL ?? 'qwen2.5:1.5b';
const cases = [
  {
    id: 'sum-array',
    source: 'export function sum(values: number[]): number { return values.length; }\n',
    prompt:
      'Fix sum in task.ts: return the sum of the numbers, including zero for an empty array. Preserve the function signature. Apply the change.',
    checks: 'assert.equal(sum([]),0);assert.equal(sum([2,3,-1]),4);assert.equal(sum([-2,-4]),-6);',
  },
  {
    id: 'nullable-label',
    source: 'export function label(value: string | null): string { return value.trim(); }\n',
    prompt:
      'Fix label in task.ts: null returns an empty string, strings are trimmed. Preserve the function signature. Apply the change.',
    checks:
      'assert.equal(label(null),"");assert.equal(label(" a "),"a");assert.equal(label(""),"");',
  },
];
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-eval-'));
const results: { passed: boolean; [key: string]: unknown }[] = [];
let modelDigest = '';
let preflightError = '';
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
try {
  const info = (await models(endpoint)).find((item) => item.name === model);
  assert.ok(info, 'Install the chosen model before evaluation.');
  modelDigest = info.digest ?? 'unavailable';
  for (const fixture of cases) {
    const directory = path.join(temp, fixture.id),
      project = path.join(directory, 'project'),
      output = path.join(directory, 'check');
    await fs.mkdir(project, { recursive: true });

    await fs.writeFile(path.join(project, 'task.ts'), fixture.source);
    await fs.writeFile(
      path.join(project, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, target: 'ES2022', noEmit: true },
        include: ['task.ts'],
      }),
    );
    const store = new Store(path.join(directory, 'state'));
    await store.load();
    store.value.workspacePath = project;
    store.value.settings = {
      ...store.value.settings,
      endpoint,
      model,
      mapFormat: 'compact',
      temperature: 0,
      maxSteps: 8,
      contextTokens: 32768,
    };
    let approvals = 0;
    let timedOut = false;
    let needsInput = false;
    const interventions: Intervention[] = [];
    const errors: string[] = [];
    const start = Date.now();
    const agent = new Agent(store, (event) => {
      if (event.type === 'approval') {
        approvals++;
        agent.approve(
          event.approval.id,
          ['write', 'changeset', 'typecheck', 'validation'].includes(event.approval.kind),
        );
      }
      if (event.type === 'clarification') {
        needsInput = true;
        interventions.push({
          kind: 'clarification',
          actor: 'runner',
          at: Date.now(),
          reason: 'Stopped without supplying a task-solving answer',
        });
        queueMicrotask(() => agent.stop());
      }
      if (event.type === 'error') errors.push(event.error);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      agent.stop();
    }, 180000);
    try {
      await agent.run(fixture.prompt);
    } catch (error) {
      errors.push(String(error));
    } finally {
      clearTimeout(timeout);
    }
    let passed = false,
      validation = '';
    try {
      const source = await fs.readFile(path.join(project, 'task.ts'), 'utf8');
      assert.notEqual(source, fixture.source, 'No edit applied');
      validation = JSON.stringify(await verifyFixture(project, output, fixture.checks));
      passed = true;
    } catch (error) {
      validation = String(error);
    }
    const taskOutcome = store.value.sessions[0]?.task?.outcome;
    const delivered =
      taskOutcome === 'completed_verified' || taskOutcome === 'completed_unverified';
    const autonomousPass = passed && delivered && !timedOut && !needsInput && !errors.length;
    results.push({
      id: fixture.id,
      passed: autonomousPass,
      falseVerifiedCompletion: taskOutcome === 'completed_verified' && !passed,
      acceptancePassed: passed,
      status: timedOut
        ? 'timeout'
        : needsInput
          ? 'needs_input'
          : autonomousPass
            ? 'passed'
            : 'failed',
      taskOutcome,
      metrics: evalMetrics(
        store.value.sessions[0]?.messages ?? [],
        interventions,
        approvals,
        Date.now() - start,
      ),
      durationMs: Date.now() - start,
      approvals,
      errors,
      validation,
      toolCalls: store.value.sessions[0].messages
        .filter((m) => m.role === 'tool')
        .map((m) => ({
          name: m.name,
          error: m.content.startsWith('Tool error:'),
          detail: m.content.startsWith('Tool error:') ? m.content : undefined,
        })),
      transcript: store.value.sessions[0].messages.map((m) => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
      })),
    });
    await store.close();
    console.log(`${results.at(-1)?.passed ? 'PASS' : 'FAIL'} ${fixture.id}`);
  }
} catch (error) {
  preflightError = String(error);
  process.exitCode = 1;
} finally {
  const report = {
    revision,
    dirty,
    preflightError,
    modelDigest,
    createdAt: new Date().toISOString(),
    harness: '0.2.0',
    model,
    endpoint,
    platform: `${process.platform}/${process.arch}`,
    node: process.version,
    settings: { temperature: 0, contextTokens: 32768, maxSteps: 8 },
    status: preflightError
      ? 'unavailable'
      : results.every((result) => result.passed)
        ? 'passed'
        : 'failed',
    scope: 'Two temporary TypeScript fixtures; not a React/Next quality benchmark.',
    results,
  };
  const destination = path.resolve(
    process.env.FORGE_EVAL_REPORT ?? '.forge-test-results/evaluation.json',
  );
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(destination);
  if (results.some((r) => !r.passed)) process.exitCode = 1;
  await fs.rm(temp, { recursive: true, force: true });
}
