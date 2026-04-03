/**
 * Template factory for the scaffolded project's `oxlint.json`.
 *
 * Enforces zero-any policy and common correctness rules out of the box,
 * matching the GWEN monorepo's linting standards.
 */

/**
 * Returns the `oxlint.json` content for a newly scaffolded GWEN project.
 *
 * @returns A formatted JSON string (with trailing newline).
 */
export function oxlintTemplate(): string {
  const config = {
    $schema: 'https://cdn.jsdelivr.net/npm/oxlint/configuration_schema.json',
    rules: {
      'no-unused-vars': 'warn',
      'no-explicit-any': 'error',
      eqeqeq: 'error',
      'no-console': 'warn',
    },
    ignorePatterns: ['dist/', 'node_modules/'],
  };

  return JSON.stringify(config, null, 2) + '\n';
}
