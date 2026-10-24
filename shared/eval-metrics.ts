import type { Message } from './types';
export type Intervention = {
  kind: 'clarification' | 'manual-edit' | 'follow-up' | 'restart' | 'recipe-added';
  actor: 'human' | 'runner';
  at: number;
  reason: string;
};
export function evalMetrics(
  messages: Message[],
  interventions: Intervention[],
  approvals: number,
  durationMs: number,
) {
  const tools = messages.filter((message) => message.role === 'tool');
  return {
    durationMs,
    toolCalls: tools.length,
    toolErrors: tools.filter((message) => message.content.startsWith('Tool error:')).length,
    manualInterventions: interventions.filter((event) => event.actor === 'human').length,
    runnerInterventions: interventions.filter((event) => event.actor === 'runner').length,
    approvals,
    // Approval is a policy boundary, not evidence of human problem solving.
    interventions,
  };
}
