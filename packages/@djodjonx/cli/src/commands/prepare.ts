/**
 * `gwen prepare` command
 *
 * Generate .gwen/ folder with TypeScript configuration and type definitions.
 *
 * @example
 * ```bash
 * gwen prepare
 * gwen prepare --verbose
 * ```
 */

import { defineCommand } from 'citty';
import { setLogLevel, logger } from '../utils/logger.js';
import { GLOBAL_ARGS } from '../utils/args.js';
import { ExitCode } from '../utils/constants.js';
import { prepare as corePrepare } from '../core/prepare/index.js';

export default defineCommand({
  meta: {
    name: 'prepare',
    description: 'Generate .gwen/ (tsconfig + types)',
  },
  args: {
    ...GLOBAL_ARGS,
    strict: {
      type: 'boolean' as const,
      description: 'Fail on validation errors (useful for CI)',
    },
  },
  async run({ args }) {
    setLogLevel({ verbose: args.verbose as boolean, debug: args.debug as boolean });

    logger.debug('Starting prepare command');

    const result = await corePrepare({
      verbose: args.verbose as boolean,
      strict: args.strict as boolean,
    });

    if (!result.success) {
      for (const error of result.errors) {
        logger.error(error);
      }
      process.exit(ExitCode.ERROR_CONFIG);
    }

    logger.success(`Generated ${result.files.length} files`);
  },
});
