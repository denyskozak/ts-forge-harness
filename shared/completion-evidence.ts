import type { TaskRecord } from './task';
import { checkKey } from './check-identity';

/** A check is evidence only for a nonempty, exact source snapshot. */
export function completionEvidence(task: TaskRecord) {
  const missing: string[] = [];
  if (task.appliedChanges < 1) missing.push('No changes were applied to the project');
  if (!task.fingerprint) missing.push('Current source snapshot is unavailable');
  if (!task.requiredChecks.length) missing.push('No required checks were defined');
  for (const check of task.requiredChecks) {
    const receipt = task.validations.findLast((result) => checkKey(result) === checkKey(check));
    if (
      !receipt ||
      receipt.status !== 'passed' ||
      receipt.exitCode !== 0 ||
      !task.fingerprint ||
      receipt.fingerprint !== task.fingerprint
    )
      missing.push(
        `${check.recipe}: ${!receipt ? 'not run' : !task.fingerprint || receipt.fingerprint !== task.fingerprint ? 'stale' : receipt.exitCode !== 0 ? 'unsuccessful exit' : receipt.status}`,
      );
  }
  const acceptancePending =
    !task.criteria.length ||
    !task.fingerprint ||
    task.criteria.some((item) => item.acceptedFingerprint !== task.fingerprint);
  return {
    checksSatisfied: missing.length === 0,
    acceptancePending,
    verified: missing.length === 0 && !acceptancePending,
    missing,
  };
}
