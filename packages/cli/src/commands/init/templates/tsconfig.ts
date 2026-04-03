/**
 * Template factory for the scaffolded project's `tsconfig.json`.
 *
 * Uses TypeScript 6 settings with `moduleResolution: "bundler"` and strict
 * mode enabled — compatible with Vite 8 and the GWEN monorepo conventions.
 */

/**
 * Returns the `tsconfig.json` content for a newly scaffolded GWEN project.
 *
 * @returns A formatted JSON string (with trailing newline).
 */
export function tsconfigTemplate(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      noEmit: true,
      types: ['vite/client'],
      ignoreDeprecations: '6.0',
    },
    include: ['src/**/*', 'gwen.config.ts'],
    exclude: ['node_modules', 'dist'],
  };

  return JSON.stringify(config, null, 2) + '\n';
}
