import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesSingleButtonPage,
  replacementPageContract,
  singleButtonLabel,
} from '../electron/page-replacement';
import { completePageReplacement, focusedEditMessages } from '../electron/context';

test('a fully replaced standalone page retains its module contract without old UI priming', () => {
  const source =
    "import React from 'react'; const items = [{ name: 'cat', emoji: '🐱' }]; const App = () => <main>Old gallery</main>; export default App;";
  assert.match(replacementPageContract(source) ?? '', /exactly one default/);
  const messages = focusedEditMessages({
    prompt: 'Remove all page elements and leave only a single button.',
    source: { path: 'App.tsx', content: source },
    project: 'React, App.tsx',
    earlierRequests: ['Use Portuguese'],
    decisions: ['No network'],
    task: { constraints: ['No packages'], outOfScope: [], criteria: [] },
  });
  assert.doesNotMatch(messages[1].content, /Old gallery/);
  assert.match(messages[1].content, /Use Portuguese/);
  assert.match(messages[1].content, /No network/);
  assert.match(messages[1].content, /No packages/);
  assert.equal(completePageReplacement('Replace the entire page with a form.'), true);
  assert.equal(completePageReplacement('Add a single button beside the search input.'), false);
  assert.equal(completePageReplacement('Remove all unused imports from the page.'), false);
  assert.equal(completePageReplacement('Keep only used imports in the page.'), false);
  assert.equal(
    completePageReplacement('Remove all elements from the array used by the page.'),
    false,
  );
  assert.equal(
    completePageReplacement('Remove all buttons from the page; keep its headings.'),
    false,
  );
});

test('props, other exports and module side effects keep the full source available', () => {
  for (const source of [
    'export default function App(props: { title: string }) { return <main>{props.title}</main>; }',
    'export default function App<T>() { return <main />; }',
    'export const api = 1; export default function App() { return <main />; }',
    'initialize(); export default function App() { return <main />; }',
    'const value = load(); export default function App() { return <main />; }',
    'const value = config.getter; export default function App() { return <main />; }',
    'const value = counter++; export default function App() { return <main />; }',
    "import './styles.css'; export default function App() { return <main />; }",
  ]) {
    assert.equal(replacementPageContract(source), undefined);
    const messages = focusedEditMessages({
      prompt: 'Replace the entire page.',
      source: { path: 'App.tsx', content: source },
      project: 'React',
      earlierRequests: [],
      decisions: [],
      task: { constraints: [], outOfScope: [], criteria: [] },
    });
    assert.ok(messages[1].content.includes(source));
  }
});

test('a single-button replacement ignores superseded gallery instructions and rejects gallery output', () => {
  const prompt =
    'Remove all existing elements from the page and leave only a single button with the text "Hello World".';
  const source = 'export default function App() { return <main><h1>Gallery</h1><input /></main>; }';
  const messages = focusedEditMessages({
    prompt,
    source: { path: 'App.tsx', content: source },
    project: 'React',
    earlierRequests: ['Build an emoji gallery with search.', 'Keep the interface in Portuguese.'],
    decisions: [],
    task: {
      constraints: [],
      outOfScope: [],
      criteria: [{ id: 'old', description: 'Restore earlier emoji gallery' }],
    },
  });
  assert.doesNotMatch(messages[1].content, /emoji gallery|<input/);
  assert.match(messages[1].content, /Portuguese/);
  assert.equal(singleButtonLabel(prompt), 'Hello World');
  assert.equal(matchesSingleButtonPage(source, 'Hello World'), false);
  assert.equal(
    matchesSingleButtonPage(
      'export default () => <main><button>Hello World</button><span>Gallery</span></main>;',
      'Hello World',
    ),
    false,
  );
  assert.equal(
    matchesSingleButtonPage(
      'export default () => <main><button>Hello World</button></main>;',
      'Hello World',
    ),
    true,
  );
});
