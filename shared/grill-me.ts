export const GRILL_ME_COMMAND = /^\/grill-me(?=\s|$)/i;

export const GRILL_ME_SKILL = {
  id: 'grill-me' as const,
  name: 'Grill Me',
  description: 'Use /grill-me followed by your idea to agree on a plan before implementation.',
  tags: ['Planning', 'Questions'],
  instructions:
    'This mode is explicitly invoked with /grill-me. Ask one consequential unresolved question at a time. Start with the decision the others depend on. Ask about outcomes and scope, observable behavior, compatibility, or data only when the answer changes the plan. Resolve project facts from the supplied evidence. Offer two or three distinct answers, recommend one and explain the tradeoff. Retain previous answers. When remaining work is clear, summarize the decisions and a short plan. This is an interview; do not implement or request approvals.',
};
