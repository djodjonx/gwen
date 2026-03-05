/**
 * Unit tests for Result type and error handling
 */

import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, unwrap, map, mapErr, getOrElse } from '../../src/index.js';

describe('Result type - ok/err/isOk/isErr', () => {
  it('should create success result with ok()', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it('should create error result with err()', () => {
    const result = err(new Error('fail'));
    expect(result.ok).toBe(false);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it('should identify success with isOk()', () => {
    const success = ok('value');
    const failure = err('error');
    expect(isOk(success)).toBe(true);
    expect(isOk(failure)).toBe(false);
  });

  it('should identify failure with isErr()', () => {
    const success = ok('value');
    const failure = err('error');
    expect(isErr(success)).toBe(false);
    expect(isErr(failure)).toBe(true);
  });
});

describe('Result type - unwrap', () => {
  it('should return value on success', () => {
    const result = ok(42);
    expect(unwrap(result)).toBe(42);
  });

  it('should throw on failure', () => {
    const error = new Error('fail');
    const result = err(error);
    expect(() => unwrap(result)).toThrow(error);
  });
});

describe('Result type - map', () => {
  it('should transform value on success', () => {
    const result = ok(5);
    const mapped = map(result, (v) => v * 2);
    expect(isOk(mapped)).toBe(true);
    expect(unwrap(mapped)).toBe(10);
  });

  it('should pass through error on failure', () => {
    const error = new Error('fail');
    const result = err(error);
    const mapped = map(result, (v: any) => v * 2);
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error).toBe(error);
    }
  });
});

describe('Result type - mapErr', () => {
  it('should transform error on failure', () => {
    const result = err('original');
    const mapped = mapErr(result, (e) => `transformed: ${e}`);
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error).toBe('transformed: original');
    }
  });

  it('should pass through value on success', () => {
    const result = ok(42);
    const mapped = mapErr(result, (e: any) => `error: ${e}`);
    expect(isOk(mapped)).toBe(true);
    expect(unwrap(mapped)).toBe(42);
  });
});

describe('Result type - getOrElse', () => {
  it('should return value on success', () => {
    const result = ok(42);
    expect(getOrElse(result, 0)).toBe(42);
  });

  it('should return default on failure', () => {
    const result = err('fail');
    expect(getOrElse(result, 0)).toBe(0);
  });
});

describe('Result type - chaining', () => {
  it('should chain multiple operations', () => {
    // Manual chaining with map
    const result = ok(5);
    const mapped1 = map(result, (v) => v * 2);
    const mapped2 = map(mapped1, (v) => v + 3);

    expect(unwrap(mapped2)).toBe(13);
  });
});
