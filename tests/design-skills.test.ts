import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsSchema } from '../electron/schema';
import { DESIGN_SKILLS, designSkillsForProject } from '../shared/design-skills';
import { DEFAULT_SETTINGS, SKILLS } from '../shared/types';

test('design skills are available without changing existing defaults', () => {
  for (const skill of DESIGN_SKILLS) {
    assert.ok(SKILLS.some((candidate) => candidate.id === skill.id));
  }
  assert.deepEqual(settingsSchema.parse(DEFAULT_SETTINGS).skills, DEFAULT_SETTINGS.skills);
});

test('storefront design work receives hierarchy, system, data and visual review guidance', () => {
  assert.deepEqual(
    designSkillsForProject(
      'Улучши дизайн и визуальную иерархию магазина',
      ['React'],
      ['apps/web/src/App.tsx'],
    ),
    [
      'product-ui-design',
      'accessibility-design',
      'visual-hierarchy',
      'design-system',
      'data-interface-design',
      'visual-review',
    ],
  );
});

test('mobile form work selects responsive and interaction guidance', () => {
  assert.deepEqual(
    designSkillsForProject(
      'Create a responsive login form',
      ['React Native', 'Expo'],
      ['src/screens/Login.tsx'],
    ),
    ['product-ui-design', 'accessibility-design', 'responsive-design', 'forms-interaction-design'],
  );
});

test('backend work receives no design instructions', () => {
  assert.deepEqual(
    designSkillsForProject(
      'Refactor database migrations',
      ['Node.js'],
      ['apps/api/src/database.ts'],
    ),
    [],
  );
});

test('verified Vite demos get cleanup guidance, while ordinary product UIs and explicit retention do not', async () => {
  const { needsStarterCleanup, viteDemoParts } = await import('../shared/starter-ui');
  const { focusedEditMessages } = await import('../electron/context');
  const template = `import viteLogo from './assets/vite.svg';
import reactLogo from './assets/react.svg';
export default function App() {
  return <><img src={viteLogo} alt="Vite logo"/><img src={reactLogo}/>
    <h1>Get started</h1><p>Edit src/App.tsx and save to test HMR</p>
    <section id="next-steps">Explore Vite</section></>;
}`;
  const prompt = 'Build a simple emoji gallery.';
  assert.equal(needsStarterCleanup(prompt, template), true);
  assert.equal(needsStarterCleanup('Build a gallery, but keep the starter demo.', template), false);
  assert.equal(needsStarterCleanup('Inspect this page.', template), false);
  assert.equal(
    needsStarterCleanup(prompt, '<main><h1>Get started</h1><button>Count</button></main>'),
    false,
  );
  const candidate =
    '<main><h1>Emoji gallery</h1><section id="next-steps">Explore Vite</section></main>';
  assert.deepEqual(viteDemoParts(candidate), ['the Vite documentation and community sections']);
  const messages = focusedEditMessages({
    prompt,
    source: { path: 'src/App.tsx', content: template },
    task: { constraints: [], criteria: [], outOfScope: [] },
    earlierRequests: [],
    decisions: [],
    project: 'React and Vite',
  });
  assert.match(messages[1].content, /replace the stock logo hero/);
});
