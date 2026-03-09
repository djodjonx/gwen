/**
 * `gwen dev` command
 *
 * Starts development server with hot module reloading.
 *
 * @example
 * ```bash
 * gwen dev
 * gwen dev --port 3001 --open
 * gwen dev --verbose
 * ```
 */

import { defineCommand } from 'citty';
import { setLogLevel, logger } from '../utils/logger.js';
import { GLOBAL_ARGS } from '../utils/args.js';
import { DEFAULT_PORT_DEV, ExitCode } from '../utils/constants.js';
import { dev as coreDev } from '../core/dev.js';

function parsePort(input: unknown): number {
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Port must be between 1024 and 65535');
  }
  return port;
}

export default defineCommand({
  meta: {
    name: 'dev',
    description: 'Start development server with hot reload',
  },
  args: {
    ...GLOBAL_ARGS,
    port: {
      type: 'string',
      alias: 'p',
      description: 'HTTP server port',
      default: String(DEFAULT_PORT_DEV),
    },
    open: {
      type: 'boolean',
      alias: 'o',
      description: 'Auto-open browser on start',
    },
  },
  async run({ args }) {
    setLogLevel({ verbose: args.verbose as boolean, debug: args.debug as boolean });

    // Validate port with lightweight runtime checks
    let port: number;
    try {
      port = parsePort(args.port);
    } catch (error: any) {
      logger.error('Invalid port:', error.message);
      process.exit(ExitCode.ERROR_VALIDATION);
    }

    logger.info(`Starting dev server on port ${port}...`);

    await coreDev({
      port,
      open: args.open as boolean,
    });
  },
});
