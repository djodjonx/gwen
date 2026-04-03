/**
 * Template factory for the scaffolded project's `.oxfmtrc.json`.
 *
 * Enforces consistent formatting across all TypeScript source files,
 * matching the GWEN monorepo's style conventions.
 */

/**
 * Returns the `.oxfmtrc.json` content for a newly scaffolded GWEN project.
 *
 * @returns A formatted JSON string (with trailing newline).
 */
export function oxfmtTemplate(): string {
  const config = {
    indentWidth: 2,
    lineWidth: 100,
    trailingComma: 'all',
    singleQuote: true,
    semi: true,
  };

  return JSON.stringify(config, null, 2) + '\n';
}
