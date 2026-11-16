/** Signatures of stock React/Vite demo UI. A generic heading or counter alone is not evidence of a starter. */
export function viteDemoParts(source: string): string[] {
  const parts: string[] = [];
  if (
    /(?:assets\/vite\.svg|['"]\/vite\.svg['"])/u.test(source) &&
    /assets\/react\.svg/u.test(source) &&
    /alt=["']Vite logo["']/u.test(source)
  )
    parts.push('the Vite and React logo demo');
  if (
    /(?:Get started|Vite \+ React)/u.test(source) &&
    /src\/App\.tsx/u.test(source) &&
    /HMR/u.test(source)
  )
    parts.push('the Vite welcome and HMR instructions');
  if (
    /id=["']next-steps["']/u.test(source) &&
    /(?:Explore Vite|Join the Vite community)/u.test(source)
  )
    parts.push('the Vite documentation and community sections');
  if (/Click on the Vite and React logos to learn more/u.test(source))
    parts.push('the Vite logo help text');
  if (/className=["']counter["']/u.test(source) && /Count is\s*\{/iu.test(source))
    parts.push('the starter counter');
  return parts;
}

export function needsStarterCleanup(prompt: string, source: string): boolean {
  const preserveDemo =
    /\b(?:keep|preserve|retain)\b[^.!?\n]{0,64}\b(?:starter|boilerplate|demo)\b|(?:оставь|сохрани)[^.!?\n]{0,64}(?:шаблон|демо)/iu.test(
      prompt,
    );
  if (preserveDemo) return false;
  const shipsProduct =
    /\b(?:build|create|implement|remove|clean|replace|strip)\b|собер|созда|реализ|убери|удали|очист|замени/iu.test(
      prompt,
    );
  const looksLikeVite =
    /\b(?:viteLogo|reactLogo)\b/u.test(source) && /vite(?:\.dev|\.svg)/u.test(source);
  return shipsProduct && looksLikeVite && viteDemoParts(source).length >= 2;
}

export const STARTER_UI_SKILL = {
  id: 'starter-ui-cleanup' as const,
  name: 'Starter UI Cleanup',
  description: 'Replace confirmed scaffold demo content when shipping the first real screen.',
  tags: ['Scaffold', 'Clean start', 'UI'],
  instructions:
    'Inspect the entry screen before implementing a product UI. When it contains recognizable starter demo content, replace the stock logo hero, counter, developer help and sample navigation with the requested product screen. Clean up imports, styles and HTML metadata that only supported the demo when in scope. Preserve real features, user-edited content, dependencies and build configuration. Honor explicit requests to keep the demo. Verify the requested controls are visible and starter content is absent in the local preview.',
};
