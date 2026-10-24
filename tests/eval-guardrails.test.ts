import test from 'node:test';
import assert from 'node:assert/strict';
import { createFailureGuard } from '../electron/failure-guard';
import { completionEvidence } from '../shared/completion-evidence';
import { evalMetrics } from '../shared/eval-metrics';
import { taskOutcome, type TaskRecord } from '../shared/task';

function task(): TaskRecord {
  return {
    runId: 'test',
    goal: 'Fix sum',
    constraints: [],
    outOfScope: [],
    criteria: [{ id: 'sum', description: 'Sums numbers', acceptedFingerprint: 'snapshot' }],
    requiredChecks: [{ recipe: 'typescript.check', project: 'tsconfig.json', files: [] }],
    validations: [
      {
        id: 'check',
        recipe: 'typescript.check',
        project: 'tsconfig.json',
        files: [],
        fingerprint: 'snapshot',
        startedAt: 1,
        durationMs: 1,
        status: 'passed',
        exitCode: 0,
        output: '',
      },
    ],
    fingerprint: 'snapshot',
    appliedChanges: 1,
    outcome: 'in_progress',
  };
}
test('completion requires checks and acceptance on the same nonempty snapshot', () => {
  const record = task();
  assert.equal(taskOutcome(record), 'completed_verified');
  record.fingerprint = '';
  record.validations[0].fingerprint = '';
  record.criteria[0].acceptedFingerprint = '';
  assert.equal(completionEvidence(record).verified, false);
});
test('a newer failed receipt supersedes an earlier success', () => {
  const record = task();
  record.validations.push({ ...record.validations[0], id: 'later', status: 'failed', exitCode: 1 });
  assert.equal(completionEvidence(record).checksSatisfied, false);
});
test('checks cannot substitute for acceptance, changes, or a fresh snapshot', () => {
  const record = task();
  delete record.criteria[0].acceptedFingerprint;
  assert.equal(completionEvidence(record).checksSatisfied, true);
  assert.equal(completionEvidence(record).verified, false);
  record.validations[0].fingerprint = 'old';
  assert.equal(completionEvidence(record).checksSatisfied, false);
  record.appliedChanges = 0;
  assert.match(completionEvidence(record).missing.join(';'), /No changes were applied/);
});
test('repeated errors survive successful reads but reset after source progress', () => {
  const guard = createFailureGuard();
  assert.equal(guard.observe('apply_changeset', 'Tool error: required path', 'a')?.count, 1);
  assert.equal(guard.observe('read_file', 'source', 'a'), undefined);
  assert.equal(guard.observe('apply_changeset', 'Tool error: required files', 'a')?.count, 2);
  assert.equal(
    guard.observe('apply_changeset', 'Tool error: required entries', 'a')?.repeated,
    true,
  );
  assert.equal(guard.observe('apply_changeset', 'Tool error: required entries', 'b')?.count, 1);
});
test('failure telemetry omits raw diagnostics and catches structured failures', () => {
  const guard = createFailureGuard(2);
  assert.throws(() => createFailureGuard(1));
  const receipt = guard.observe('validate', JSON.stringify({ exitCode: 1, output: 'secret' }), 'a');
  assert.equal(receipt?.category, 'execution');
  assert.ok(!JSON.stringify(receipt).includes('secret'));
  guard.reset();
  assert.equal(guard.observe('validate', '{"success":false}', 'a')?.count, 1);
});
test('approvals are distinct from manual assistance and runner intervention', () => {
  const metrics = evalMetrics(
    [],
    [
      { kind: 'manual-edit', actor: 'human', at: 1, reason: 'Fixed generated code' },
      { kind: 'clarification', actor: 'runner', at: 2, reason: 'Stopped' },
    ],
    7,
    10,
  );
  assert.equal(metrics.manualInterventions, 1);
  assert.equal(metrics.runnerInterventions, 1);
  assert.equal(metrics.approvals, 7);
});

test('legacy typecheck text receipts also count as execution failures', () => {
  const guard = createFailureGuard();
  assert.equal(guard.observe('typecheck', 'Diagnostics\nExit code: 1', 'a')?.category, 'execution');
  assert.equal(guard.observe('typecheck', 'Exit code: 0', 'a'), undefined);
});
