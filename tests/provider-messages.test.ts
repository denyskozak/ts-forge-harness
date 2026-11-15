import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chat, type LLMMessage } from '../electron/provider';

test('Ollama receives all system instructions before the dialogue and keeps tool pairing intact', async (t) => {
  const messages: LLMMessage[] = [
    { role: 'system', content: 'Product boundaries' },
    { role: 'user', content: 'Implement the requested feature' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ function: { name: 'read_file', arguments: { path: 'App.tsx' } } }],
    },
    { role: 'tool', tool_name: 'read_file', content: 'source evidence' },
    { role: 'system', content: 'Repair the compiler error; return complete source' },
  ];
  const original = structuredClone(messages);
  let received: LLMMessage[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received = JSON.parse(body).messages;
    res.end(
      JSON.stringify({ done: true, done_reason: 'length', message: { content: 'ok' } }) + '\n',
    );
  });
  t.after(() => server.close());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const answer = await chat(
    `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    { model: 'fixture', messages },
    AbortSignal.timeout(5000),
    () => {},
  );
  assert.equal(
    answer.finishReason,
    'length',
    'Keep the provider truncation signal for artifact validation',
  );
  assert.deepEqual(messages, original, 'Do not mutate the stored conversation');
  assert.deepEqual(received, [
    {
      role: 'system',
      content: 'Product boundaries\n\nRepair the compiler error; return complete source',
    },
    ...original.slice(1, -1),
  ]);
  // Llama's template emits the assistant prefix after the last user/tool turn,
  // but skips a trailing system turn entirely.
  assert.equal(received.at(-1)?.role, 'tool');
});
