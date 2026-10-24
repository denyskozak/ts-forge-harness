import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { architectureOutlook } from '../electron/architecture-outlook';
import {
  SECURITY_ARCHITECTURE_SKILLS,
  securityArchitectureSkillsForPrompt,
} from '../shared/security-architecture-skills';
import { SKILLS, DEFAULT_SETTINGS } from '../shared/types';
import { settingsSchema } from '../electron/schema';

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-outlook-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('outlook separates source evidence from conditional growth and omits source contents', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(
    path.join(root, 'service.ts'),
    'const userId = actor.id;\nfetch("DO_NOT_ECHO_CONTENT");\ndrizzle(db);',
  );
  const report = await architectureOutlook(root, new AbortController().signal);
  assert.equal(report.complete, true);
  assert.equal(report.scenarios.length, 3);
  for (const scenario of report.scenarios) {
    assert.equal(scenario.confidence, 'hypothesis');
    assert.equal(scenario.options.length, 3);
    assert.equal(scenario.evidence?.[0].path, 'service.ts');
    assert.ok(scenario.trigger && scenario.verify);
  }
  assert.equal(report.scenarios[1].evidence?.[0].line, 2);
  assert.doesNotMatch(JSON.stringify(report), /DO_NOT_ECHO_CONTENT/);
});
test('empty and ignored projects produce no speculative growth requirements', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, '.forgeignore'), 'private.ts\n');
  await fs.writeFile(path.join(root, 'private.ts'), 'fetch("secret");');
  await fs.writeFile(path.join(root, '.env'), 'SECRET=private');
  const report = await architectureOutlook(root, new AbortController().signal);
  assert.equal(report.checked, 0);
  assert.deepEqual(report.scenarios, []);
});
test('bounded scans report incomplete coverage and obey cancellation', async (t) => {
  const root = await fixture(t);
  await Promise.all(
    Array.from({ length: 301 }, (_, i) => fs.writeFile(path.join(root, `${i}.ts`), 'export {};')),
  );
  const report = await architectureOutlook(root, new AbortController().signal);
  assert.equal(report.checked, 300);
  assert.equal(report.complete, false);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(architectureOutlook(root, controller.signal));
});
test('security runbooks are selectable, persist and activate only for relevant prompts', () => {
  for (const skill of SECURITY_ARCHITECTURE_SKILLS) {
    assert.ok(SKILLS.some((s) => s.id === skill.id));
    assert.ok(
      settingsSchema.parse({ ...DEFAULT_SETTINGS, skills: [skill.id] }).skills.includes(skill.id),
    );
  }
  assert.equal(securityArchitectureSkillsForPrompt('Проверь безопасность API').length, 5);
  assert.deepEqual(securityArchitectureSkillsForPrompt('Улучши архитектуру'), [
    'architecture-evolution',
  ]);
  assert.deepEqual(securityArchitectureSkillsForPrompt('Change button spacing'), []);
});
