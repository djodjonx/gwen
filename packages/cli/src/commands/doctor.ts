/**
 * `gwen doctor` command
 *
 * Runs a suite of health checks against the current project and reports
 * the results. Exits with code 1 if any check fails.
 *
 * Checks performed:
 *  1. Node.js version  — must be >= 18
 *  2. gwen.config.ts   — must exist in cwd
 *  3. WASM binary      — must exist in node_modules/@gwenengine/core
 *
 * @example
 * ```bash
 * gwen doctor
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { logger } from '../utils/logger.js';

/**
 * Describes a single project health check.
 */
export interface HealthCheck {
  /** Human-readable name shown in the doctor output. */
  name: string;
  /**
   * Executes the check and returns a result object.
   *
   * @returns `{ ok: true, message }` on success, `{ ok: false, message }` on
   *          failure where `message` describes the finding.
   */
  run(): Promise<{ ok: boolean; message: string }>;
}

/**
 * Built-in health checks exported for testing.
 */
export const CHECKS: HealthCheck[] = [
  {
    name: 'Node.js version',
    async run() {
      const [major] = process.versions.node.split('.').map(Number);
      if (major >= 18) {
        return { ok: true, message: `v${process.versions.node}` };
      }
      return {
        ok: false,
        message: `v${process.versions.node} — Node.js >= 18 is required`,
      };
    },
  },
  {
    name: 'gwen.config.ts exists',
    async run() {
      const configPath = path.join(process.cwd(), 'gwen.config.ts');
      if (fs.existsSync(configPath)) {
        return { ok: true, message: configPath };
      }
      return {
        ok: false,
        message: `Not found at ${configPath} — run 'gwen init' to create a project`,
      };
    },
  },
  {
    name: 'WASM binary',
    async run() {
      // Look for the WASM file shipped with @gwenengine/core.
      const candidates = [
        path.join(process.cwd(), 'node_modules', '@gwenengine', 'core', 'dist', 'gwen.wasm'),
        path.join(process.cwd(), 'node_modules', '@gwenengine', 'core', 'gwen.wasm'),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (found) {
        return { ok: true, message: found };
      }
      return {
        ok: false,
        message: '@gwenengine/core WASM binary not found — run your package manager install',
      };
    },
  },
];

/** Named export consumed by bin.ts and tests. */
export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check project health',
  },
  async run() {
    logger.info('Running GWEN project health checks…\n');

    let allOk = true;

    for (const check of CHECKS) {
      const result = await check.run();
      if (result.ok) {
        logger.success(`✓ ${check.name}: ${result.message}`);
      } else {
        logger.error(`✗ ${check.name}: ${result.message}`);
        allOk = false;
      }
    }

    if (!allOk) {
      logger.error('\nSome checks failed — resolve the issues above and re-run gwen doctor.');
      process.exit(1);
    }

    logger.success('\nAll checks passed ✓');
  },
});
