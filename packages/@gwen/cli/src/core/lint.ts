/**
 * Lint core implementation using Execa
 *
 * Runs oxlint on source files to check for issues.
 * Can auto-fix detected issues with the fix option.
 */

import { execSafe } from '../utils/processes.js';

/**
 * Options for linting
 *
 * @property {boolean} [fix] - Auto-fix detected issues
 * @property {string} [path] - Path to lint (default: src)
 */
export interface LintOptions {
  fix?: boolean;
  path?: string;
}

/**
 * Result of linting operation
 *
 * @property {boolean} success - Whether linting succeeded
 * @property {number} exitCode - Process exit code
 * @property {string} output - Linting output (stdout or stderr)
 */
export interface LintResult {
  success: boolean;
  exitCode: number;
  output: string;
}

/**
 * Run linting on source code with oxlint
 *
 * Uses oxlint to check for code issues and optionally fix them.
 * Executes safely using Execa (no shell injection).
 *
 * @param opts - Linting options
 * @returns Promise resolving to linting result
 *
 * @example
 * ```typescript
 * const result = await lint({ fix: true, path: 'src' });
 * if (result.success) {
 *   console.log('Linting passed');
 * }
 * ```
 */
export async function lint(opts: LintOptions = {}): Promise<LintResult> {
  const path = opts.path ?? 'src';
  const args: string[] = [];

  if (opts.fix) {
    args.push('--fix');
  }

  args.push(path);

  const result = await execSafe('oxlint', args);

  return {
    success: result.success,
    exitCode: result.exitCode,
    output: result.stdout || result.stderr,
  };
}
