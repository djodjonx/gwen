/**
 * Template factory for the scaffolded project's `package.json`.
 *
 * Always includes Vite 8, TypeScript 6, oxlint, oxfmt, and all required
 * scripts so the generated project is immediately lint-ready and type-safe.
 */

/**
 * Build the `package.json` content for a newly scaffolded GWEN project.
 *
 * @param name - The project (npm package) name.
 * @param gwenVersion - The GWEN engine version to stamp into peer deps.
 * @param extraModules - Optional additional `@gwenjs/*` modules selected by user.
 * @returns A formatted JSON string (with trailing newline).
 */
export function packageJsonTemplate(
  name: string,
  gwenVersion: string,
  extraModules: string[] = [],
): string {
  const moduleDeps = Object.fromEntries(extraModules.map((m) => [m, `^${gwenVersion}`]));

  const pkg = {
    name,
    version: '0.0.1',
    type: 'module',
    private: true,
    scripts: {
      dev: 'gwen dev',
      build: 'gwen build',
      postinstall: 'gwen prepare',
      lint: 'oxlint src/',
      'lint:fix': 'oxlint --fix src/',
      format: 'oxfmt src/',
      'format:check': 'oxfmt --check src/',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@gwenjs/core': `^${gwenVersion}`,
      '@gwenjs/app': `^${gwenVersion}`,
      '@gwenjs/renderer-canvas2d': `^${gwenVersion}`,
      '@gwenjs/input': `^${gwenVersion}`,
      ...moduleDeps,
    },
    devDependencies: {
      '@gwenjs/cli': `^${gwenVersion}`,
      '@gwenjs/vite': `^${gwenVersion}`,
      vite: '^8.0.0',
      typescript: '^6.0.0',
      oxlint: '^0.16.0',
      oxfmt: '^0.36.0',
    },
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}
