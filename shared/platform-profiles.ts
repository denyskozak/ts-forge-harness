/** Capability guidance is selected from manifest evidence, never from model guesses. */
export const PLATFORM_PROFILES = [
  {
    id: 'vue-platform',
    name: 'Vue',
    packages: ['vue', 'nuxt'],
    tags: ['Vue', 'SFC'],
    instructions:
      'Inspect installed Vue/Nuxt versions and existing Options/Composition API conventions. Trace SFC props, emits, reactive state, composables and router boundaries. Preserve SSR isolation and hydration. Verify templates with installed vue-tsc or Nuxt checks; plain tsc and a Vite build alone do not prove SFC type correctness. Test keyboard interaction, loading and failure states.',
  },
  {
    id: 'angular-platform',
    name: 'Angular',
    packages: ['@angular/core'],
    tags: ['Angular', 'Templates'],
    instructions:
      'Read angular.json, installed versions, bootstrap and routing before editing. Preserve standalone or NgModule conventions, dependency injection boundaries and reactive forms. Keep observable subscriptions and effects scoped to their owners. Validate templates with the installed Angular compiler/build and test route, form and error behavior. Plain tsc does not validate Angular templates.',
  },
  {
    id: 'svelte-platform',
    name: 'Svelte',
    packages: ['svelte', '@sveltejs/kit'],
    tags: ['Svelte', 'SSR'],
    instructions:
      'Inspect the installed Svelte version before choosing runes or legacy reactivity. Trace route load functions, actions and server/client boundaries. Avoid shared server user state. Use installed svelte-check and framework build; TypeScript alone cannot check Svelte templates. Test hydration, navigation and progressive form behavior.',
  },
  {
    id: 'web-platform',
    name: 'Web runtime',
    packages: ['react', 'vue', 'svelte', '@angular/core', 'next', 'vite'],
    tags: ['Browser', 'DOM'],
    instructions:
      'Trace entrypoint, routing, state and network boundaries before editing. Use semantic HTML, scoped event listeners, cancellation and explicit pending/error states. Verify affected behavior in the local browser including console/network errors, keyboard and narrow viewport. Keep business rules testable outside rendering. Browser evidence covers only the exercised scenarios.',
  },
  {
    id: 'native-platform',
    name: 'Native runtime',
    packages: ['react-native', 'expo'],
    tags: ['Mobile', 'Devices'],
    instructions:
      'Inspect platform files, permissions, navigation and native dependencies. Preserve safe areas, keyboard behavior, app background/foreground lifecycle and listener cleanup. Select unit and device-level checks independently. A browser preview does not verify iOS or Android. Report simulator/device verification unavailable when no tool can execute it; do not invent a native test receipt.',
  },
  {
    id: 'three-platform',
    name: 'Three.js runtime',
    packages: ['three', '@react-three/fiber'],
    tags: ['3D', 'GPU'],
    instructions:
      'Determine whether scene ownership is imperative Three.js or React Three Fiber before editing. Trace scene, camera, render loop, controls and asset loading. Use delta time, bounded allocations and explicit ownership of geometries, materials, textures and subscriptions. Dispose owned resources on removal; do not dispose shared assets still in use. Test game rules separately from rendering, then exercise input, resize, loading failures and scene teardown. A visible canvas alone does not prove gameplay or resource cleanup.',
  },
  {
    id: 'pixi-platform',
    name: 'PixiJS runtime',
    packages: ['pixi.js', '@pixi/react'],
    tags: ['2D', 'Canvas'],
    instructions:
      'Inspect installed PixiJS version and renderer initialization API. Trace containers, ticker, input events and asset ownership; use delta time and remove ticker callbacks during teardown. Separate pure game rules from rendering and verify resize, input, asset failure and scene replacement in browser. Preserve shared texture ownership and test repeated mount/unmount for leaks.',
  },
  {
    id: 'node-platform',
    name: 'Node.js services',
    packages: ['express', 'fastify', 'hono', '@nestjs/core', '@hapi/hapi', 'koa'],
    tags: ['API', 'Lifecycle'],
    instructions:
      'Follow the installed framework routing, middleware/plugin and lifecycle conventions. Trace request validation, authentication, resource authorization, use case and repository. Bound bodies, pagination, external requests and concurrency. Implement graceful shutdown and consistent errors without secret leakage. Test real HTTP success and denial paths, transactions and restart persistence. Keep domain logic separate from HTTP adapters.',
  },
  {
    id: 'desktop-platform',
    name: 'Desktop boundaries',
    packages: ['electron', '@tauri-apps/api'],
    tags: ['Desktop', 'IPC'],
    instructions:
      'Map privileged host, renderer and IPC boundaries. Validate IPC sender and payload, expose minimal capabilities, keep credentials out of renderer and review navigation, filesystem and process access. Test packaged/preload behavior and lifecycle separately from web preview. Report unavailable native build tooling explicitly.',
  },
] as const;
export type PlatformSkillId = (typeof PLATFORM_PROFILES)[number]['id'];
export const PLATFORM_SKILLS = PLATFORM_PROFILES.map(({ id, name, tags, instructions }) => ({
  id,
  name,
  tags: [...tags],
  instructions,
  description: `Evidence-based development and verification for ${name}.`,
}));
