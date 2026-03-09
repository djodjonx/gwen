/**
 * E2E tests for CLI
 * Tests CLI through actual execution
 */

import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { resolve } from 'pathe';

const cliPath = resolve(__dirname, '../../dist/cli/src/bin.js');

describe('CLI E2E', () => {
  it('should show help', async () => {
    const { stdout } = await execa('node', [cliPath, '--help']);
    expect(stdout).toContain('gwen');
    expect(stdout).toContain('prepare');
    expect(stdout).toContain('dev');
    expect(stdout).toContain('build');
  });

  it('should show version', async () => {
    const { stdout } = await execa('node', [cliPath, '--version']);
    expect(stdout).toMatch(/0\.\d+\.\d+/);
  });

  it('should show prepare help', async () => {
    const { stdout } = await execa('node', [cliPath, 'prepare', '--help']);
    expect(stdout).toContain('prepare');
    expect(stdout).toContain('--verbose');
  });

  it('should show dev help with port option', async () => {
    const { stdout } = await execa('node', [cliPath, 'dev', '--help']);
    expect(stdout).toContain('dev');
    expect(stdout).toContain('--port');
    expect(stdout).toContain('3000');
  });

  it('should show build help with mode option', async () => {
    const { stdout } = await execa('node', [cliPath, 'build', '--help']);
    expect(stdout).toContain('build');
    expect(stdout).toContain('--mode');
  });

  it('should reject unknown command', async () => {
    const result = await execa('node', [cliPath, 'unknown'], {
      reject: false,
    });
    expect(result.exitCode).not.toBe(0);
  });

  it('should accept global verbose flag', async () => {
    const { stdout } = await execa('node', [cliPath, 'prepare', '--help', '--verbose']);
    expect(stdout).toContain('prepare');
  });

  it('should accept global debug flag', async () => {
    const { stdout } = await execa('node', [cliPath, 'dev', '--help', '--debug']);
    expect(stdout).toContain('dev');
  });
});
