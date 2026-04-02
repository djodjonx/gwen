/**
 * `gwen info` command
 *
 * Display parsed configuration from gwen.config.ts
 * Useful for debugging configuration issues.
 *
 * @example
 * ```bash
 * gwen info
 * gwen info | jq '.engine'
 * ```
 */

import { defineCommand } from 'citty';
import { setLogLevel, logger } from '../utils/logger.js';
import { GLOBAL_ARGS } from '../utils/args.js';
import { ExitCode } from '../utils/constants.js';
import { loadGwenConfig, findConfigFile } from '../core/config.js';
import { parseError } from '../core/types/guards.js';

export default defineCommand({
  meta: {
    name: 'info',
    description: 'Show parsed gwen.config.ts',
  },
  args: {
    ...GLOBAL_ARGS,
  },
  async run({ args }) {
    setLogLevel({ verbose: args.verbose as boolean, debug: args.debug as boolean });

    logger.debug('Starting info command');

    try {
      const configPath = await findConfigFile(process.cwd());
      if (!configPath) {
        logger.error('gwen.config.ts not found');
        process.exit(ExitCode.ERROR_CONFIG);
      }

      const result = await loadGwenConfig(process.cwd());
      console.log(JSON.stringify(result.config, null, 2));
    } catch (error: unknown) {
      logger.error('Failed to load config:', parseError(error));
      process.exit(ExitCode.ERROR_CONFIG);
    }
  },
});
