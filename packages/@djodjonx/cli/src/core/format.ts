/**
 * Format core implementation using Execa
 *
 * Formats source code using oxfmt to ensure consistent style.
 */

import { execSafe } from '../utils/processes.js';

/**
 * Options for formatting
 *
 * @property {boolean} [check] - Check format without modifying files
 * @property {string} [path] - Path to format (default: src)
 */
export interface FormatOptions {
  check?: boolean;
  path?: string;
}

/**
 * Result of formatting operation
 *
 * @property {boolean} success - Whether formatting succeeded
 * @property {number} exitCode - Process exit code
 * @property {string} output - Formatting output (stdout or stderr)
 */
export interface FormatResult {
  success: boolean;
  exitCode: number;
  output: string;
}

/**
 * Format source code with oxfmt
 *
 * Formats source code to ensure consistent style.
 * Can check format without modifying with the check option.
 * Executes safely using Execa (no shell injection).
 *
 * @param opts - Formatting options
 * @returns Promise resolving to formatting result
 *
 * @example
 * ```typescript
 * const result = await format({ check: true, path: 'src' });
 * if (result.success) {
 *   console.log('Code is properly formatted');
 * }
 * ```
 */
export async function format(opts: FormatOptions = {}): Promise<FormatResult> {
  const path = opts.path ?? 'src';
  const args: string[] = [];

  if (opts.check) {
    args.push('--check');
  }

  args.push(path);

  const result = await execSafe('oxfmt', args);

  return {
    success: result.success,
    exitCode: result.exitCode,
    output: result.stdout || result.stderr,
  };
}
