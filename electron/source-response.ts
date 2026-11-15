/** Decode one complete source artifact; the harness, never the model, owns its path. */
export function sourceResponse(content: string, finishReason?: string): string {
  if (finishReason === 'length') throw new Error('Source generation reached its output limit.');
  const trimmed = content.trim();
  // Compatibility with tool-capable providers and saved JSON fixtures.
  if (trimmed.startsWith('{')) {
    const value = JSON.parse(trimmed) as { content?: unknown };
    if (typeof value.content !== 'string' || !value.content.trim())
      throw new Error('Expected complete source content.');
    return value.content;
  }
  const blocks = [...trimmed.matchAll(/^```([^\n]*)\r?\n([\s\S]*?)\r?\n```\s*$/gm)];
  if (blocks.length !== 1 || !/^(?:tsx?|typescript)?$/i.test(blocks[0][1].trim()))
    throw new Error('Expected exactly one complete TypeScript code block.');
  const outside = trimmed.replace(blocks[0][0], '');
  if (outside.includes('```') || !blocks[0][2].trim())
    throw new Error('Incomplete or ambiguous source response.');
  return blocks[0][2] + '\n';
}
