import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyFixture } from '../scripts/acceptance';

test('independent acceptance rejects wrong behavior and type errors despite candidate claims', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-acceptance-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  await fs.mkdir(project);
  const checks = 'assert.equal(sum([]),0); assert.equal(sum([2,3,-1]),4);';
  await fs.writeFile(
    path.join(project, 'task.ts'),
    'export const sum = (v: number[]): number => v.length;',
  );
  await assert.rejects(verifyFixture(project, path.join(root, 'wrong'), checks));
  await fs.writeFile(
    path.join(project, 'task.ts'),
    'export const sum = (v: number[]): number => "success";',
  );
  await assert.rejects(verifyFixture(project, path.join(root, 'types'), checks));
  await fs.writeFile(
    path.join(project, 'task.ts'),
    'export const sum = (v: number[]): number => v.reduce((a,b)=>a+b,0);',
  );
  assert.equal((await verifyFixture(project, path.join(root, 'valid'), checks)).passed, true);
  assert.deepEqual(await fs.readdir(project), ['task.ts']);
});
