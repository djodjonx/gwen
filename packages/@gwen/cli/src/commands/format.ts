/**
 * `gwen format` command
 *
 * Format source code with oxfmt.
 *
 * @example
 * ```bash
 * gwen format
 * gwen format --check
 * gwen format --check --verbose
 * ```
 */

import { defineCommand } from 'citty';
import { setLogLevel, logger } from '../utils/logger.js';
import { GLOBAL_ARGS } from '../utils/args.js';
import { format as coreFormat } from '../core/format.js';

export default defineCommand({
  meta: {
    name: 'format',
    description: 'Format source code with oxfmt',
  },
  args: {
    ...GLOBAL_ARGS,
    check: {
      type: 'boolean',
      description: 'Check format without writing',
    },
    path: {
      type: 'string',
      description: 'Path to format',
      default: 'src',
    },
  },
  async run({ args }) {
    setLogLevel({ verbose: args.verbose as boolean, debug: args.debug as boolean });

    logger.debug('Starting format');

    const result = await coreFormat({
      check: args.check as boolean,
      path: args.path as string,
    });

    if (result.output) console.log(result.output);

    if (!result.success) {
      process.exit(result.exitCode);
    }

    logger.success('Formatting complete');
  },
});
