import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { compilerDirectory } from '../electron/compiler';
import { executeResult } from '../electron/executor';

/** Assertions live outside the agent workspace and are never offered as editable files. */
export async function verifyFixture(project: string, output: string, assertions: string) {
  await fs.mkdir(output, { recursive: true });
  const compile = await executeResult(
    process.execPath,
    [
      path.join(compilerDirectory(), 'bin/tsc'),
      path.join(project, 'task.ts'),
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'commonjs',
      '--outDir',
      output,
    ],
    output,
    AbortSignal.timeout(30000),
    [project, output, compilerDirectory()],
    [output],
  );
  assert.equal(compile.exitCode, 0, compile.output);
  const marker = randomUUID();
  await fs.writeFile(
    path.join(output, 'acceptance.cjs'),
    `const assert=require('node:assert/strict'); const {sum,label}=require('./task.js');\n${assertions}\nconsole.log(${JSON.stringify(marker)});`,
  );
  const result = await executeResult(
    process.execPath,
    [path.join(output, 'acceptance.cjs')],
    output,
    AbortSignal.timeout(10000),
    [output],
    [],
  );
  assert.equal(result.exitCode, 0, result.output);
  assert.ok(result.output.includes(marker), 'Assertions did not finish');
  return { passed: true, compilerExitCode: compile.exitCode, behaviorExitCode: result.exitCode };
}
