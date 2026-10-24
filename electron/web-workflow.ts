import type { Message } from '../shared/types';

/** Focus explicit read-only research, using only receipts from this user turn. */
export function nextWebResearchTool(
  prompt: string,
  messages: Message[],
  enabled: boolean,
  implementation: boolean,
) {
  if (!enabled || implementation) return undefined;
  const start = messages.findLastIndex((message) => message.role === 'user');
  const receipts = messages.slice(start + 1).filter((message) => message.role === 'tool');
  const requested = [
    ...(/\bweb_search\b|(?:search|find).{0,60}(?:web|online|internet)|(?:найди|поищи|поиск).{0,60}(?:интернет|сайт)/iu.test(
      prompt,
    )
      ? ['web_search']
      : []),
    ...(/\bweb_read\b|(?:read|fetch|прочитай|прочти).{0,100}https:\/\//iu.test(prompt)
      ? ['web_read']
      : []),
  ];
  for (const name of requested) {
    const attempts = receipts.filter((message) => message.name === name);
    // Declines and failures are evidence too: do not repeatedly prompt for approval.
    if (!attempts.length) return name;
  }
  return undefined;
}
