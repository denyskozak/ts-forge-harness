/** Counts semantic tool failures across intervening reads. Real changed snapshots reset the budget. */
export function createFailureGuard(limit = 3) {
  if (!Number.isInteger(limit) || limit < 2) throw new Error('Failure limit must be at least two.');
  let snapshot = '';
  const counts = new Map<string, number>();
  return {
    observe(tool: string, output: string, fingerprint: string) {
      if (fingerprint && snapshot && fingerprint !== snapshot) counts.clear();
      if (fingerprint) snapshot = fingerprint;
      let error = output.startsWith('Tool error:') ? output.slice(11) : '';
      if (!error && /(?:^|\n)Exit code: (?!0(?:\s|$))-?\d+/.test(output))
        error = 'execution failed';
      if (!error) {
        try {
          const result = JSON.parse(output);
          if (
            result.status === 'failed' ||
            result.success === false ||
            (typeof result.exitCode === 'number' && result.exitCode !== 0)
          )
            error = String(result.status ?? 'execution failed');
        } catch {
          /* Plain text is not an execution failure receipt. */
        }
      }
      if (!error) return undefined;
      // Do not retain source, credentials, paths or raw errors in telemetry keys.
      const category = /expected|invalid_type|too_small|too_big|required/i.test(error)
        ? 'arguments'
        : /path|workspace|protected/i.test(error)
          ? 'path-policy'
          : /permission|denied|declined/i.test(error)
            ? 'permission'
            : 'execution';
      const key = `${tool}:${category}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { tool, category, count, repeated: count >= limit };
    },
    reset() {
      counts.clear();
    },
  };
}
