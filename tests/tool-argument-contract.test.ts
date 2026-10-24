import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { normalizeToolArguments } from '../electron/tool-recovery';
import { toolDefinitions } from '../electron/agent';
import { safePath } from '../electron/workspace';
import { contractInputSchema } from '../shared/task';

test('advertised planning and edit schemas preserve executor constraints', () => {
  const plan = toolDefinitions.find((tool) => tool.function.name === 'plan_task')!.function
    .parameters;
  assert.equal(plan.properties.requiredChecks.minItems, 1);
  assert.equal(plan.properties.criteria.minItems, 1);
  assert.equal(plan.properties.goal.minLength, 1);
  const edits = toolDefinitions.find((tool) => tool.function.name === 'apply_changeset')!.function
    .parameters;
  assert.equal(edits.properties.edits.minItems, 1);
  assert.equal(
    normalizeToolArguments(
      'plan_task',
      { goal: 'Fix', criteria: ['Fix'], requiredChecks: [] },
      contractInputSchema,
    ).repaired,
    false,
  );
});

test('nested changeset paths become relative only under the actual workspace root', () => {
  const schema = z.object({ edits: z.array(z.object({ path: z.string(), content: z.string() })) });
  const args = {
    edits: [
      { path: '/project/src/a.ts', content: 'keep /project/content untouched' },
      { path: '/elsewhere/src/a.ts', content: 'outside' },
      { path: '/project-other/src/a.ts', content: 'prefix sibling' },
      { path: '/project/../elsewhere/a.ts', content: 'traversal' },
    ],
  };
  const result = normalizeToolArguments('apply_changeset', args, schema, '/project');
  assert.deepEqual(result.arguments.edits, [
    { ...args.edits[0], path: 'src/a.ts' },
    ...args.edits.slice(1),
  ]);
  assert.equal(args.edits[0].path, '/project/src/a.ts');
});

test('normalization does not bypass symlink, secret or outside-workspace policies', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-relative-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'task.ts'), 'export {}');
  await fs.writeFile(path.join(root, '.env'), 'SECRET=value');
  await fs.symlink(path.join(root, 'task.ts'), path.join(root, 'link.ts'));
  const schema = z.object({ path: z.string() });
  for (const input of [path.join(root, '.env'), path.join(root, 'link.ts'), '/elsewhere/task.ts']) {
    const normalized = normalizeToolArguments('read_file', { path: input }, schema, root);
    await assert.rejects(safePath(root, normalized.arguments.path as string));
  }
  const valid = normalizeToolArguments(
    'read_file',
    { path: path.join(root, 'task.ts') },
    schema,
    root,
  );
  assert.equal(valid.arguments.path, 'task.ts');
  assert.equal(await safePath(root, 'task.ts'), await fs.realpath(path.join(root, 'task.ts')));
});

test('validation paths and read_files aliases use the same root boundary', () => {
  const validation = z.object({ project: z.string(), files: z.array(z.string()) });
  assert.deepEqual(
    normalizeToolArguments(
      'run_validation',
      { project: '/project/tsconfig.json', files: ['/project/src/a.ts'] },
      validation,
      '/project',
    ).arguments,
    { project: 'tsconfig.json', files: ['src/a.ts'] },
  );
  assert.deepEqual(
    normalizeToolArguments(
      'read_files',
      { filePaths: ['/project/src/a.ts', '/other/a.ts'] },
      z.object({ paths: z.array(z.string()) }),
      '/project',
    ).arguments,
    { paths: ['src/a.ts', '/other/a.ts'] },
  );
});
