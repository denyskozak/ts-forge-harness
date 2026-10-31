import { DEFAULT_TASK_PIPELINE, type TaskCheckpoint } from '../../shared/checkpoint';
export function TaskTimeline({
  checkpoint,
  toolCount,
  busy,
  onResume,
}: {
  checkpoint?: TaskCheckpoint;
  toolCount?: number;
  busy: boolean;
  onResume: () => void;
}) {
  if (!checkpoint) return null;
  const pipeline = checkpoint.pipeline ?? DEFAULT_TASK_PIPELINE;
  return (
    <section className="task-timeline" aria-label="Task progress">
      <ol>
        {pipeline.map((phase) => (
          <li key={phase} aria-current={checkpoint.phase === phase ? 'step' : undefined}>
            {phase}
          </li>
        ))}
      </ol>
      <div>
        <span>
          {checkpoint.kind ?? 'change'} · Pass {checkpoint.step}
          {toolCount !== undefined ? ` · ${toolCount} tools loaded` : ''}
        </span>
        <details>
          <summary>Capabilities</summary>
          <span>{checkpoint.groups.join(' · ')}</span>
          <p>{checkpoint.reason}</p>
          {checkpoint.context && (
            <p>
              Context: approximately {checkpoint.context.estimatedInputTokens} /{' '}
              {checkpoint.context.inputBudgetTokens} input tokens ·{' '}
              {checkpoint.context.removedGroups} historical groups compacted. Goals and decisions
              remain in saved task evidence.
            </p>
          )}
        </details>
        {!busy && checkpoint.resumable && (
          <button className="button" onClick={onResume}>
            Resume task
          </button>
        )}
      </div>
    </section>
  );
}
