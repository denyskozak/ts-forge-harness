import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGrillMeTurn } from '../electron/grill-me';

test('Grill Me accepts two concrete options and picks exactly one recommendation', () => {
  const turn = {
    kind: 'question',
    question: 'Should notes stay on this device or sync?',
    reason: 'Sync requires an account and a server.',
    options: [
      { label: 'This device', description: 'Store notes in local browser storage.' },
      { label: 'Sync devices', description: 'Add an account and synchronize notes.' },
    ],
    recommended: 1,
  };
  assert.deepEqual(parseGrillMeTurn(JSON.stringify(turn), 'Plan notes.', true), turn);
  assert.throws(() =>
    parseGrillMeTurn(JSON.stringify({ ...turn, recommended: 3 }), 'Plan notes.', true),
  );
  assert.throws(() =>
    parseGrillMeTurn(
      JSON.stringify({ ...turn, options: [turn.options[0], turn.options[0]] }),
      'Plan notes.',
      true,
    ),
  );
  assert.throws(() => parseGrillMeTurn(JSON.stringify(turn), 'Plan notes.', false));
});
