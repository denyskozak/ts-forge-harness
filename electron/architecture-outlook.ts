import { readText, scanFiles } from './workspace';

const scenarios = [
  {
    id: 'identity',
    match: /\b(?:tenantId|userId|session|authorize|authenticate)\b/,
    fact: 'Identity or ownership terminology occurs in source.',
    trigger: 'Multiple users, organizations or roles share persisted resources.',
    next: 'Keep authorization centralized and enforce ownership in data access before adding more roles.',
    verify: 'Test anonymous, cross-user and cross-tenant access for reads and writes.',
    question: 'Who must be isolated from whom?',
    options: ['Single user', 'Users with separate resources', 'Organizations with shared members'],
  },
  {
    id: 'external-io',
    match: /\b(?:fetch|axios|WebSocket|upload|execFile|spawn)\s*\(/,
    fact: 'An external I/O API occurs in source.',
    trigger:
      'User-controlled destinations, larger payloads or unreliable dependencies are introduced.',
    next: 'Place I/O behind a narrow adapter with input policy, cancellation and resource bounds.',
    verify:
      'Test denied inputs, timeouts, cancellation and oversized responses with local fixtures.',
    question: 'Where will input and integrations come from?',
    options: ['Trusted local data', 'Known external providers', 'Public user-supplied input'],
  },
  {
    id: 'persistence',
    match: /\b(?:PrismaClient|drizzle|createConnection|transaction|findMany)\s*\(/,
    fact: 'A persistence or transaction API occurs in source.',
    trigger: 'Concurrent writes, growing datasets or stricter recovery requirements appear.',
    next: 'Preserve a single deployment; review transactions, pagination, indexes and migrations first.',
    verify:
      'Test concurrent writes, restart persistence and migration recovery on a disposable database.',
    question: 'What data loss is acceptable?',
    options: ['Disposable demo data', 'Recoverable personal data', 'Business-critical records'],
  },
] as const;

export async function architectureOutlook(root: string, signal: AbortSignal) {
  const scan = await scanFiles(root, 10000, signal);
  const candidates = scan.files.filter((file) => /\.[cm]?[jt]sx?$/.test(file)).sort();
  const evidence = new Map<string, { path: string; line: number }[]>();
  let checked = 0;
  const warnings = [...scan.warnings];
  for (const file of candidates.slice(0, 300)) {
    signal.throwIfAborted();
    let source: string;
    try {
      source = await readText(root, file);
    } catch {
      signal.throwIfAborted();
      warnings.push(`Could not inspect ${file}`);
      continue;
    }
    checked++;
    const lines = source.split('\n');
    for (const scenario of scenarios) {
      const line = lines.findIndex((text) => scenario.match.test(text));
      const matches = evidence.get(scenario.id) ?? [];
      if (line >= 0 && matches.length < 5)
        evidence.set(scenario.id, [...matches, { path: file, line: line + 1 }]);
    }
  }
  return {
    complete: scan.complete && checked === candidates.length,
    checked,
    warnings,
    scenarios: scenarios
      .filter((s) => evidence.has(s.id))
      .map(({ match: _match, ...scenario }) => ({
        ...scenario,
        evidence: evidence.get(scenario.id),
        confidence: 'hypothesis',
      })),
    guidance:
      'Read cited sources: lexical matches can include comments, tests or unrelated identifiers. These are conditional review leads, not vulnerabilities or forecasts. Do not infer missing controls from this scan. Ask only consequential unanswered questions using the existing question UI; do not block routine work on hypothetical growth.',
  };
}
