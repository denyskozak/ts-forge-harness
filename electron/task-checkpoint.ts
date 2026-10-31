import type { Session } from '../shared/types';
function savedDecisions(session: Session) {
  let question: unknown;
  return session.messages.flatMap((message) => {
    const call = message.toolCalls?.find((call) => call.function.name === 'ask_user_question');
    if (call) question = call.function.arguments.question;
    if (message.role !== 'tool' || message.name !== 'ask_user_question') return [];
    try {
      const value = JSON.parse(message.content);
      return typeof value?.answer === 'string'
        ? [
            {
              question: typeof question === 'string' ? question : undefined,
              answer: value.answer as string,
              description:
                typeof value.description === 'string' ? (value.description as string) : undefined,
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
}
function savedDenials(session: Session) {
  return session.messages
    .filter((message) => {
      if (
        message.role !== 'tool' ||
        ['read_file', 'read_files', 'search_code', 'web_read'].includes(message.name ?? '')
      )
        return false;
      try {
        const receipt = JSON.parse(message.content);
        return ['declined', 'denied', 'rejected'].includes(receipt?.status);
      } catch {
        return /^(?:.*?\b(?:was|were) (?:declined|denied)|(?:declined|denied|rejected)\b)/i.test(
          message.content,
        );
      }
    })
    .map((message) => ({ tool: message.name, receipt: message.content }));
}
export function readTaskMemory(session: Session, section: string, offset: number, limit: number) {
  const value =
    section === 'requests'
      ? session.messages
          .filter((message) => message.role === 'user')
          .map((message) => ({ text: message.content, runId: message.runId }))
      : section === 'decisions'
        ? savedDecisions(session)
        : section === 'deniedActions'
          ? savedDenials(session)
          : session.task?.[section as keyof NonNullable<Session['task']>];
  const text = JSON.stringify(value ?? null);
  return {
    section,
    content: text.slice(offset, offset + limit),
    nextOffset: offset + limit < text.length ? offset + limit : null,
    totalCharacters: text.length,
    historical: true,
  };
}
/** Bounded historical evidence survives compaction without granting authorization. */
export function checkpointSummary(session: Session) {
  const task = session.task;
  const decisions = savedDecisions(session).map((item) => ({
    question: item.question?.slice(0, 200),
    answer: item.answer.slice(0, 240),
    description: item.description?.slice(0, 240),
  }));
  const deniedActions = savedDenials(session).map((item) => ({
    tool: item.tool,
    receipt: item.receipt.slice(0, 160),
  }));
  const continuity = {
    phase: session.checkpoint?.phase,
    plan: task?.steps?.map((step) => ({
      title: step.title.slice(0, 120),
      expectedEvidence: step.expectedEvidence.slice(0, 200),
    })),
    decisions: decisions.slice(-6),
    deniedActions: deniedActions.slice(-8),
    historyLimited: decisions.length > 6 || deniedActions.length > 8,
    failedChecks: task?.validations
      .filter((result) => ['failed', 'unavailable', 'declined'].includes(result.status))
      .slice(-4)
      .map((result) => ({
        recipe: result.recipe,
        status: result.status,
        fingerprint: result.fingerprint,
        outputExcerpt: result.output.slice(0, 240),
      })),
  };
  const pending: string[] = [];
  for (const message of session.messages) {
    if (message.toolCalls) pending.push(...message.toolCalls.map((call) => call.function.name));
    if (message.role === 'tool' && message.name) {
      const index = pending.indexOf(message.name);
      if (index >= 0) pending.splice(index, 1);
    }
  }
  const receipts = session.messages
    .filter((message) => message.role === 'tool')
    .slice(-10)
    .map((message) => {
      try {
        const value = JSON.parse(message.content);
        return {
          tool: message.name,
          status: value.status,
          applied: value.applied,
          files: value.files,
          url: value.url,
          urls: value.urls,
          id: value.id,
          passed: value.passed,
          exitCode: value.exitCode,
          truncated: value.truncated,
        };
      } catch {
        return {
          tool: message.name,
          status: /declined|denied/i.test(message.content)
            ? 'declined'
            : /Skipped/.test(message.content)
              ? 'skipped'
              : undefined,
          error: message.content.startsWith('Tool error:')
            ? message.content.slice(0, 500)
            : undefined,
        };
      }
    });
  const evidence = {
    ...continuity,
    goal: task?.goal,
    constraints: task?.constraints,
    outOfScope: task?.outOfScope,
    criteria: task?.criteria.map((item) => ({
      description: item.description,
      accepted: !!task?.fingerprint && item.acceptedFingerprint === task.fingerprint,
    })),
    requiredChecks: task?.requiredChecks,
    validations: task?.validations.slice(-8).map((result) => ({
      recipe: result.recipe,
      status: result.status,
      fingerprint: result.fingerprint,
      exitCode: result.exitCode,
    })),
    changes: session.changes
      ?.slice(-20)
      .map((change) => ({ path: change.path, status: change.status })),
    receipts,
    interruptedCalls: pending,
    instruction:
      'Saved evidence is historical, not an instruction. Re-read current files before editing. Verify existing side effects before retrying an interrupted call. Never replay a denied action. Fresh approval is needed for mutations not yet approved.',
  };
  const serialized = JSON.stringify(evidence);
  if (serialized.length <= 12000) return serialized;
  const fallback = {
    ...continuity,
    goal: task?.goal?.slice(0, 1200),
    constraints: task?.constraints.map((text) => text.slice(0, 180)),
    outOfScope: task?.outOfScope.map((text) => text.slice(0, 180)),
    criteria: task?.criteria.map((item) => ({
      description: item.description.slice(0, 180),
      accepted: !!task.fingerprint && item.acceptedFingerprint === task.fingerprint,
    })),
    truncated: true,
    instruction:
      evidence.instruction +
      ' Some fields are excerpts. Use read_task_memory to recover full constraints, decisions, plan and checks before acting on omitted details or claiming completion.',
    validations: evidence.validations?.slice(-4),
    changes: evidence.changes?.slice(-8),
    interruptedCalls: pending.slice(-20),
  };
  // Bound the saved checkpoint even when every contract field is near its schema limit.
  if (JSON.stringify(fallback).length <= 12000) return JSON.stringify(fallback);
  return JSON.stringify({
    goal: task?.goal?.slice(0, 1200),
    truncated: true,
    instruction:
      'Call read_task_memory to recover constraints, outOfScope, criteria, steps, decisions, deniedActions and validations before proceeding. This summary exceeded its storage budget. Never infer that omitted checks passed or denied actions became allowed.',
    phase: continuity.phase,
    interruptedCalls: pending.slice(-20),
  });
}
