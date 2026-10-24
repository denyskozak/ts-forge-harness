import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { platformCapabilities } from '../electron/platform-capabilities';
import { discoverValidationPlan } from '../electron/validation-plan';
import { PLATFORM_SKILLS } from '../shared/platform-profiles';
import { DEFAULT_SETTINGS, SKILLS } from '../shared/types';
import { settingsSchema } from '../electron/schema';

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-platform-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (name: string, value: object | string) => {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(
      path.join(root, name),
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  };
  return { root, write };
}
test('mixed workspace retains package-local stacks and declared versions', async (t) => {
  const { root, write } = await fixture(t);
  await write('package.json', {});
  await write('apps/web/package.json', { dependencies: { vue: '^3.5', 'pixi.js': '^8' } });
  await write('apps/api/package.json', { dependencies: { fastify: '^5' } });
  await write('apps/mobile/package.json', { dependencies: { 'react-native': '0.80', expo: '54' } });
  await write('apps/ng/package.json', { dependencies: { '@angular/core': '^20' } });
  const report = await platformCapabilities(root, AbortSignal.timeout(3000));
  assert.equal(report.complete, true);
  const web = report.units.find((u) => u.directory === 'apps/web')!;
  assert.ok(web.profiles.some((p) => p.id === 'vue-platform'));
  assert.ok(web.profiles.some((p) => p.id === 'pixi-platform'));
  assert.ok(!web.profiles.some((p) => p.id === 'node-platform'));
  assert.equal(web.profiles[0].evidence[0].declaredVersion, '^3.5');
  assert.ok(
    report.units
      .find((u) => u.directory === 'apps/api')
      ?.profiles.some((p) => p.id === 'node-platform'),
  );
});
test('excluded and malformed manifests cannot silently provide stack evidence', async (t) => {
  const { root, write } = await fixture(t);
  await write('.forgeignore', 'private/\n');
  await write('private/package.json', { dependencies: { vue: '3' } });
  await write('bad/package.json', '{broken');
  const report = await platformCapabilities(root, AbortSignal.timeout(3000));
  assert.equal(report.units.length, 0);
  assert.equal(report.complete, false);
  assert.match(report.warnings[0], /bad\/package.json/);
});
test('nested tsconfig discovery never invents a root config', async (t) => {
  const { root, write } = await fixture(t);
  await write('apps/web/tsconfig.app.json', {});
  const plan = await discoverValidationPlan(root, AbortSignal.timeout(3000));
  assert.deepEqual(
    plan.checks.map((c) => c.check.project),
    ['apps/web/tsconfig.app.json'],
  );
  assert.equal(plan.checks[0].confidence, 'needs-config');
});
test('every platform runbook can be selected and persists through settings validation', () => {
  for (const skill of PLATFORM_SKILLS) {
    assert.ok(SKILLS.some((s) => s.id === skill.id));
    assert.ok(
      settingsSchema.parse({ ...DEFAULT_SETTINGS, skills: [skill.id] }).skills.includes(skill.id),
    );
  }
});
