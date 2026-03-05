/**
 * Unit tests for command definitions
 * Tests Citty command metadata and args
 */

import { describe, it, expect } from 'vitest';
import prepareCommand from '../../dist/cli/src/commands/prepare.js';
import devCommand from '../../dist/cli/src/commands/dev.js';
import buildCommand from '../../dist/cli/src/commands/build.js';
import lintCommand from '../../dist/cli/src/commands/lint.js';
import formatCommand from '../../dist/cli/src/commands/format.js';

describe('Command definitions', () => {
  describe('prepare command', () => {
    it('should have correct metadata', () => {
      expect(prepareCommand.meta.name).toBe('prepare');
      expect(prepareCommand.meta.description).toContain('.gwen/');
    });

    it('should accept verbose flag', () => {
      expect(prepareCommand.args.verbose).toBeDefined();
      expect(prepareCommand.args.verbose.alias).toBe('v');
    });

    it('should accept debug flag', () => {
      expect(prepareCommand.args.debug).toBeDefined();
    });
  });

  describe('dev command', () => {
    it('should have correct metadata', () => {
      expect(devCommand.meta.name).toBe('dev');
      expect(devCommand.meta.description).toContain('development');
    });

    it('should have port option', () => {
      expect(devCommand.args.port).toBeDefined();
      expect(devCommand.args.port.default).toBe('3000');
    });

    it('should have open flag', () => {
      expect(devCommand.args.open).toBeDefined();
      expect(devCommand.args.open.type).toBe('boolean');
    });

    it('should have port alias', () => {
      expect(devCommand.args.port.alias).toBe('p');
    });
  });

  describe('build command', () => {
    it('should have correct metadata', () => {
      expect(buildCommand.meta.name).toBe('build');
      expect(buildCommand.meta.description).toContain('production');
    });

    it('should have mode option', () => {
      expect(buildCommand.args.mode).toBeDefined();
      expect(buildCommand.args.mode.default).toBe('release');
    });

    it('should have outDir option', () => {
      expect(buildCommand.args.outDir).toBeDefined();
      expect(buildCommand.args.outDir.default).toBe('dist');
    });

    it('should have dryRun flag', () => {
      expect(buildCommand.args.dryRun).toBeDefined();
      expect(buildCommand.args.dryRun.type).toBe('boolean');
    });
  });

  describe('lint command', () => {
    it('should have correct metadata', () => {
      expect(lintCommand.meta.name).toBe('lint');
      expect(lintCommand.meta.description).toContain('oxlint');
    });

    it('should have fix flag', () => {
      expect(lintCommand.args.fix).toBeDefined();
    });

    it('should have path option', () => {
      expect(lintCommand.args.path).toBeDefined();
      expect(lintCommand.args.path.default).toBe('src');
    });
  });

  describe('format command', () => {
    it('should have correct metadata', () => {
      expect(formatCommand.meta.name).toBe('format');
      expect(formatCommand.meta.description).toContain('oxfmt');
    });

    it('should have check flag', () => {
      expect(formatCommand.args.check).toBeDefined();
    });

    it('should have path option', () => {
      expect(formatCommand.args.path).toBeDefined();
      expect(formatCommand.args.path.default).toBe('src');
    });
  });

  describe('global args on all commands', () => {
    const commands = [prepareCommand, devCommand, buildCommand, lintCommand, formatCommand];

    commands.forEach((cmd) => {
      it(`${cmd.meta.name} should have verbose flag`, () => {
        expect(cmd.args.verbose).toBeDefined();
      });

      it(`${cmd.meta.name} should have debug flag`, () => {
        expect(cmd.args.debug).toBeDefined();
      });
    });
  });
});
