/** Compact Forge adaptations. Pinned upstream text and attribution are in docs/third-party/design-skills. */
export const UPSTREAM_DESIGN_SKILLS = [
  {
    id: 'anthropic-frontend-design',
    name: 'Frontend Design · Anthropic',
    description: 'Choose a visual direction grounded in the product and its audience.',
    tags: ['Visual direction', 'Typography', 'Apache-2.0'],
    instructions:
      'For design work, identify the audience, the main action and an appropriate visual character. Pick a coherent direction through type, contrast, composition and a small set of colors. Use the project’s tokens and available assets. Give one purposeful detail visual prominence, use spacing to support reading order, and remove inherited demo content that does not serve the brief. Inspect the actual rendered screen before judging the result.',
  },
  {
    id: 'impeccable-motion',
    name: 'Impeccable Motion',
    description: 'Use motion to explain a change of state or direct attention.',
    tags: ['Motion', 'Polish', 'Apache-2.0'],
    instructions:
      'Use motion for a concrete purpose: confirmation, spatial continuity, feedback or one focal moment. Keep routine transitions short and interruptible. Prefer transform and opacity, avoid moving input targets and avoid replaying entry motion during streaming updates. Maintain readable static states and a reduced-motion alternative. Test the full interaction with motion enabled and reduced.',
  },
  {
    id: 'ui-ux-pro-max',
    name: 'UI UX Pro Max',
    description:
      'Review the usability of a screen from its main task to mobile and keyboard states.',
    tags: ['UX review', 'Responsive', 'MIT'],
    instructions:
      'Match layout, visual density and interaction to the product, user and platform. Audit keyboard focus and labels, contrast and target size, overflow at narrow widths, and loading, empty, error and success states. Use predictable filters, clear primary actions and a consistent icon family already present in the project. Address the highest-impact usability defects first; verify actual results in the local preview.',
  },
] as const;
