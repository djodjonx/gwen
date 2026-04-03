/**
 * Safe process execution using Execa
 *
 * Execa provides better error handling and security than spawnSync.
 * All commands run with shell: false by default (prevents injection).
 */

import { execa } from 'execa';
import { logger } from './logger.js';

export interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute command safely (no shell interpretation)
 *
 * @param command - Command to execute (binary name)
 * @param args - Arguments array (passed safely, not through shell)
 * @param options - Execution options
 * @returns Execution result with stdout/stderr
 *
 * @example
 * ```typescript
 * const result = await execSafe('oxlint', ['--fix', 'src']);
 * if (result.success) {
 *   console.log('Linting passed');
 * }
 * ```
 */
export async function execSafe(
  command: string,
  args: string[],
  options?: { cwd?: string; stdio?: 'inherit' | 'pipe' },
): Promise<ExecResult> {
  try {
    logger.trace(`Executing: ${command} ${args.join(' ')}`);

    const result = await execa(command, args, {
      cwd: options?.cwd,
      stdio: options?.stdio ?? 'pipe',
      shell: false, // ← Secure by default (no shell interpretation)
    });

    return {
      success: true,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: 0,
    };
  } catch (error: unknown) {
    // execa throws objects with stdout/stderr/exitCode on process failure
    const e = error as { message?: string; stdout?: string; stderr?: string; exitCode?: number };
    logger.trace('Command failed:', e.message ?? String(error));
    return {
      success: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.exitCode ?? 1,
    };
  }
}
