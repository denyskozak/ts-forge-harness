import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStepMessages, normalizeNextStepSuggestion } from '../electron/next-step';
import type { Session } from '../shared/types';

const session: Session = {
  id: 'd5ebc4b1-235b-4daf-a067-cf58dc3cb4f4',
  title: 'Add a cart',
  workspace: '/tmp/store',
  updatedAt: 1,
  messages: [
    { id: '1', role: 'user', content: 'Добавь корзину магазина', time: 1 },
    { id: '2', role: 'tool', name: 'read_file', content: '{"raw":"ignored"}', time: 2 },
    {
      id: '3',
      role: 'assistant',
      content: 'Корзина добавлена, TypeScript и тесты проходят.',
      time: 3,
    },
  ],
};

test('next-step context excludes raw tool results and asks for one plain suggestion', () => {
  const messages = nextStepMessages(session, 'store');
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /exactly one useful next instruction/i);
  assert.match(messages[1].content, /Добавь корзину магазина/);
  assert.doesNotMatch(messages[1].content, /raw|read_file/);
});

test('suggestion normalization accepts plain text and a compatible object response', () => {
  assert.equal(
    normalizeNextStepSuggestion('Следующий шаг: Добавь сохранение корзины после перезагрузки.'),
    'Добавь сохранение корзины после перезагрузки.',
  );
  assert.equal(
    normalizeNextStepSuggestion('{"suggestion":"Проверь корзину в мобильном viewport."}'),
    'Проверь корзину в мобильном viewport.',
  );
});

test('suggestion normalization rejects empty, tool-shaped and code output', () => {
  assert.equal(normalizeNextStepSuggestion('NONE'), null);
  assert.equal(normalizeNextStepSuggestion('OK'), null);
  assert.equal(normalizeNextStepSuggestion('{"name":"run_validation","arguments":{}}'), null);
  assert.equal(normalizeNextStepSuggestion('```ts\nconst unsafe = true;\n```'), null);
});
