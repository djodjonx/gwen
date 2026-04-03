/**
 * Template factory for the scaffolded project's `gwen.config.ts`.
 *
 * Generates a minimal but functional engine configuration with the Canvas2D
 * renderer and input plugin enabled by default, plus any extra modules
 * selected by the user during `gwen init`.
 */

/**
 * Returns the `gwen.config.ts` content for a newly scaffolded GWEN project.
 *
 * The config always includes `@gwenjs/renderer-canvas2d` and `@gwenjs/input`
 * so the starter landing game renders immediately without additional setup.
 *
 * @param extraModules - Additional `@gwenjs/*` module identifiers selected
 *   by the user (e.g. `['@gwenjs/physics2d', '@gwenjs/audio']`).
 * @returns The TypeScript source string (with trailing newline).
 */
export function gwenConfigTemplate(extraModules: string[] = []): string {
  const extraModulesList =
    extraModules.length > 0
      ? `\n  // Extra modules selected during gwen init:\n${extraModules.map((m) => `  '${m}',`).join('\n')}\n`
      : '';

  return `import { defineConfig } from '@gwenjs/app'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'
import { InputPlugin } from '@gwenjs/input'

export default defineConfig({
  engine: { maxEntities: 2_000, targetFPS: 60 },
  modules: [${extraModulesList}],
  plugins: [
    Canvas2DRenderer({ width: 800, height: 600, background: '#0a0a1a' }),
    InputPlugin(),
  ],
})
`;
}
