/**
 * `gwen build` command
 *
 * Builds project for production with WASM and bundling.
 *
 * @example
 * ```bash
 * gwen build
 * gwen build --mode debug
 * gwen build --out-dir dist --verbose
 * ```
 */

import { defineCommand } from 'citty';
import { setLogLevel, logger } from '../utils/logger.js';
import { GLOBAL_ARGS } from '../utils/args.js';
import { ExitCode } from '../utils/constants.js';
import { build as coreBuild } from '../core/builder/index.js';

export default defineCommand({
  meta: {
    name: 'build',
    description: 'Build project for production',
  },
  args: {
    ...GLOBAL_ARGS,
    mode: {
      type: 'string',
      description: 'Build mode: release or debug',
      default: 'release',
    },
    outDir: {
      type: 'string',
      alias: 'o',
      description: 'Output directory',
      default: 'dist',
    },
    dryRun: {
      type: 'boolean',
      description: 'Simulate without writing files',
    },
  },
  async run({ args }) {
    setLogLevel({ verbose: args.verbose as boolean, debug: args.debug as boolean });

    logger.info('Building project...');

    const result = await coreBuild({
      mode: args.mode === 'debug' ? 'debug' : 'release',
      outDir: args.outDir as string,
      dryRun: args.dryRun as boolean,
    });

    if (!result.success) {
      for (const error of result.errors) {
        logger.error(error);
      }
      process.exit(ExitCode.ERROR_BUILD);
    }

    logger.success(`Build complete in ${result.durationMs}ms`);
  },
});
