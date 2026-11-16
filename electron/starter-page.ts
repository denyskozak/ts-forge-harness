import { createHash } from 'node:crypto';

// React TypeScript App.tsx produced by create-vite 9.3.4.
// A known fingerprint lets us omit demo JSX without omitting any user edits.
const stockAppDigests = new Set([
  'c7184fc9b1c36d7492093e1b5f5844c440bd3396deeace21b6699d3838f6ecb2',
]);

export function viteStarterPageContract(source: string): string | undefined {
  const digest = createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex');
  if (!stockAppDigests.has(digest)) return undefined;
  return 'The inspected file is the untouched React/Vite TypeScript demo. It exports a default App component with no props. The logo hero, counter, HMR instructions and community links are stock demonstration markup; it contains no existing product behavior. Replace the demo with the requested screen and keep a default App export. The project uses the automatic JSX transform. Import React hooks by name if using them and omit unused imports. Do not reference discarded demo assets or invent packages or endpoints.';
}
