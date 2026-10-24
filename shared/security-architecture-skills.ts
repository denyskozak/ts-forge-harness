export const SECURITY_ARCHITECTURE_SKILLS = [
  {
    id: 'threat-modeling',
    name: 'Threat modeling',
    description: 'Trace assets, trust boundaries and testable abuse cases.',
    tags: ['Security', 'Architecture'],
    instructions:
      'Use architecture_outlook and read the cited sources before design changes. Map assets, actors, entrypoints, data stores and trust boundaries. Separate observed facts, suspected threats and verified vulnerabilities. For each relevant threat state impact, mitigation and a negative test. Prioritize exposed sensitive data and privilege boundaries. Keep a short threat model beside existing architecture docs and update it when boundaries change. Static matches are review leads, never a security certification.',
  },
  {
    id: 'authorization-isolation',
    name: 'Authorization and isolation',
    description: 'Protect resource ownership and tenant boundaries.',
    tags: ['Security', 'API'],
    instructions:
      'Enforce authorization server-side for every operation and resource, including background jobs, subscriptions and bulk requests. Derive tenant and actor identity from verified sessions, never trusted request fields. Scope reads and writes in repositories; deny by default and allowlist writable fields. Test anonymous, wrong-role, cross-user and cross-tenant access, revoked sessions and concurrent permission changes. Avoid revealing resource existence through inconsistent errors. Do not introduce tenancy unless the product requires it.',
  },
  {
    id: 'untrusted-io',
    name: 'Untrusted input and output',
    description: 'Review URL, file, command and rendering boundaries.',
    tags: ['Security', 'Boundaries'],
    instructions:
      'Trace untrusted input to filesystem, network, shell and HTML sinks. Prefer argument arrays over shell interpolation. Enforce canonical path containment including symlink behavior. For server-side URLs restrict schemes and destinations, validate resolved addresses and redirects, and enforce timeouts and size limits; string validation alone does not stop SSRF. Uploads require size and type checks, safe generated names and non-executable storage. Render text safely and sanitize allowed rich content. Test denied destinations, traversal, oversized input and cancellation without contacting external targets.',
  },
  {
    id: 'security-lifecycle',
    name: 'Secrets and abuse resistance',
    description: 'Protect credentials and bound expensive operations.',
    tags: ['Security', 'Reliability'],
    instructions:
      'Keep secrets in server-side secret stores or system credential storage; never expose their values in context, logs, fixtures, client bundles or errors. Review least privilege, rotation and revocation. Bound requests, pagination, upload size, expensive queries, retries and concurrency. Use idempotency and transactions for payments or repeated writes; test duplicate and concurrent requests. Review dependency lockfiles and existing audit tooling without forced upgrades. For Electron validate IPC senders and payloads, isolate the renderer and expose narrow preload capabilities. For mobile use platform secure storage and keep privileged authorization on the server.',
  },
  {
    id: 'architecture-evolution',
    name: 'Architecture evolution',
    description: 'Plan growth from evidence and explicit product constraints.',
    tags: ['Architecture', 'Planning'],
    instructions:
      'Call architecture_outlook for architecture or growth decisions. Treat its scenarios as conditional hypotheses, not predictions or requirements. Read sources and existing ADRs. Present the simplest current design, a growth trigger, an incremental next step, a verification method and a migration/rollback path. Prefer modular boundaries inside the current deployment until measured load or independent ownership justifies separation. Ask at most one consequential unanswered question at a time using ask_user_question with exactly three choices and custom input supported by the UI. Skip questions answered by context; proceed with reversible assumptions. Record accepted decisions, alternatives, evidence and revisit triggers in existing architecture docs. Never build speculative infrastructure just to prepare for growth.',
  },
] as const;
export type SecurityArchitectureSkillId = (typeof SECURITY_ARCHITECTURE_SKILLS)[number]['id'];
export function securityArchitectureSkillsForPrompt(prompt: string): SecurityArchitectureSkillId[] {
  const security = /secur|threat|auth|tenant|безопас|угроз|авториза|изоляц/i.test(prompt);
  const architecture = /architect|scalab|growth|архитект|масштаб|разраст|развити/i.test(prompt);
  return [
    ...(security
      ? ([
          'threat-modeling',
          'authorization-isolation',
          'untrusted-io',
          'security-lifecycle',
        ] as const)
      : []),
    ...(architecture || security ? (['architecture-evolution'] as const) : []),
  ];
}
