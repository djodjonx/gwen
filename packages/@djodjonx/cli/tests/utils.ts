/**
 * Test utilities and helpers
 */

import fs from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';

/**
 * Create temporary directory for tests
 */
export function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gwen-cli-test-'));
}

/**
 * Write configuration file to directory
 */
export function writeConfig(dir: string, config: string, filename: string): void {
  fs.writeFileSync(path.join(dir, filename), config, 'utf-8');
}

/**
 * Minimal valid GWEN config for testing
 */
export const MINIMAL_CONFIG = `
export default {
  engine: {
    maxEntities: 1000,
    targetFPS: 60,
  },
};
`;

/**
 * Full GWEN config for testing
 */
export const FULL_CONFIG = `
export default {
  engine: {
    maxEntities: 5000,
    targetFPS: 120,
    debug: false,
  },
  html: {
    title: 'Test Game',
    background: '#1a1a1a',
  },
  plugins: [],
};
`;
