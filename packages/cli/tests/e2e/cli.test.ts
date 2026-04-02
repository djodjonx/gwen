/**
 * E2E tests for CLI
 * Tests CLI through actual execution
 */

import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { resolve } from 'pathe';

const cliPath = resolve(__dirname, '../../bin.js');
// Force jiti dev path in monorepo — compiled binary imports @gwenjs/* source files
const e2eEnv = { ...process.env, GWEN_CLI_FORCE_JITI: '1' };

describe('CLI E2E', () => {
  it('should show help', async () => {
    const { stdout } = await execa('node', [cliPath, '--help'], { env: e2eEnv });
    expect(stdout).toContain('gwen');
    expect(stdout).toContain('prepare');
    expect(stdout).toContain('dev');
    expect(stdout).toContain('build');
  });

  it('should show version', async () => {
    const { stdout } = await execa('node', [cliPath, '--version'], { env: e2eEnv });
    expect(stdout).toMatch(/0\.\d+\.\d+/);
  });

  it('should show prepare help', async () => {
    const { stdout } = await execa('node', [cliPath, 'prepare', '--help'], { env: e2eEnv });
    expect(stdout).toContain('prepare');
    expect(stdout).toContain('--verbose');
  });

  it('should show dev help with port option', async () => {
    const { stdout } = await execa('node', [cliPath, 'dev', '--help'], { env: e2eEnv });
    expect(stdout).toContain('dev');
    expect(stdout).toContain('--port');
    expect(stdout).toContain('3000');
  });

  it('should show build help with mode option', async () => {
    const { stdout } = await execa('node', [cliPath, 'build', '--help'], { env: e2eEnv });
    expect(stdout).toContain('build');
    expect(stdout).toContain('--mode');
  });

  it('should reject unknown command', async () => {
    const result = await execa('node', [cliPath, 'unknown'], {
      reject: false,
      env: e2eEnv,
    });
    expect(result.exitCode).not.toBe(0);
  });

  it('should accept global verbose flag', async () => {
    const { stdout } = await execa('node', [cliPath, 'prepare', '--help', '--verbose'], {
      env: e2eEnv,
    });
    expect(stdout).toContain('prepare');
  });

  it('should accept global debug flag', async () => {
    const { stdout } = await execa('node', [cliPath, 'dev', '--help', '--debug'], { env: e2eEnv });
    expect(stdout).toContain('dev');
  });
});
