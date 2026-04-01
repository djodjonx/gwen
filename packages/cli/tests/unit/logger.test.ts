/**
 * Unit tests for logger
 * Tests Consola logger levels
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger, setLogLevel } from '../../dist/cli/src/utils/logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should have logger instance', () => {
    expect(logger).toBeDefined();
  });

  it('should set verbose level', () => {
    setLogLevel({ verbose: true, debug: false });
    expect(logger.level).toBe(4);
  });

  it('should set debug level', () => {
    setLogLevel({ verbose: false, debug: true });
    expect(logger.level).toBe(5);
  });

  it('should set default info level', () => {
    setLogLevel({ verbose: false, debug: false });
    expect(logger.level).toBe(3);
  });

  it('should have debug level override verbose', () => {
    setLogLevel({ verbose: true, debug: true });
    expect(logger.level).toBe(5);
  });
});
