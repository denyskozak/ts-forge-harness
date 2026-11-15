import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceResponse } from '../electron/source-response';
import { uiImplementationGuidance } from '../electron/context';

test('source responses accept a single complete artifact without treating prose as source', () => {
  assert.equal(
    sourceResponse(
      'Here is the file.\n```tsx\nexport default function App() { return <button>Hello</button>; }\n```\nDone.',
    ),
    'export default function App() { return <button>Hello</button>; }\n',
  );
  assert.equal(sourceResponse('{"path":"elsewhere.ts","content":"export {};"}'), 'export {};');
});

test('incomplete, ambiguous and output-limited source is never accepted', () => {
  for (const answer of [
    '```tsx\nexport default function App() {',
    '```tsx\nexport {};\n```\n```ts\nexport const extra = 1;\n```',
    '```html\n<button>Hello</button>\n```',
    '```ts\n\n```',
    '{"content":"unfinished',
    'export const incomplete =',
  ])
    assert.throws(() => sourceResponse(answer));
  assert.throws(() => sourceResponse('```tsx\nexport {};\n```', 'length'), /output limit/);
  assert.throws(() => sourceResponse('{"content":"export {};"}', 'length'), /output limit/);
});

test('platform guidance follows requested interactions and does not reintroduce removed features', () => {
  const guide = uiImplementationGuidance('Build an emoji gallery with search and click-to-copy.');
  assert.match(guide, /navigator.clipboard.writeText/);
  assert.match(guide, /original dataset unchanged/);
  assert.match(guide, /Unicode/);
  assert.equal(
    uiImplementationGuidance('Remove search and clipboard controls. Leave a single button.'),
    '',
  );
  assert.equal(uiImplementationGuidance('Leave only a single Hello World button.'), '');
});
