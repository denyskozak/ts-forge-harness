import path from 'node:path';
import { z } from 'zod';
import { readText, scanFiles } from './workspace';
import { PLATFORM_PROFILES } from '../shared/platform-profiles';

const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  scripts: z.record(z.string(), z.string()).default({}),
});

/** Static evidence only. Declared packages are not proof that executables are installed. */
export async function platformCapabilities(root: string, signal: AbortSignal) {
  const scan = await scanFiles(root, 10000, signal);
  const manifests = scan.files.filter((file) => /(^|\/)package\.json$/.test(file)).sort();
  const warnings: string[] = [];
  const units = [];
  for (const file of manifests.slice(0, 40)) {
    signal.throwIfAborted();
    try {
      const manifest = manifestSchema.parse(JSON.parse(await readText(root, file)));
      const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
      const profiles = PLATFORM_PROFILES.filter((profile) =>
        profile.packages.some((pkg) => dependencies[pkg]),
      );
      units.push({
        manifest: file,
        directory: path.posix.dirname(file),
        profiles: profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          evidence: profile.packages
            .filter((pkg) => dependencies[pkg])
            .map((pkg) => ({ package: pkg, declaredVersion: dependencies[pkg] })),
        })),
        scripts: Object.keys(manifest.scripts).sort().slice(0, 40),
      });
    } catch {
      warnings.push(`Could not inspect ${file}; do not infer its stack.`);
    }
  }
  if (!scan.complete || manifests.length > 40)
    warnings.push('Capability scan is partial. Inspect the target package explicitly.');
  return {
    units,
    complete: scan.complete && manifests.length <= 40 && warnings.length === 0,
    warnings,
    limits: [
      'Versions are manifest declarations, not resolved installed versions. Inspect lockfiles and tool availability before choosing APIs.',
      'Nested package scripts and framework builds need execution support in the target package; discovery does not run or validate them.',
      'Native simulator/device tests are not provided by the current browser tools.',
      'Vue, Svelte and Angular templates need their own compiler; plain TypeScript checks are insufficient.',
    ],
  };
}
