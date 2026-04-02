/**
 * `gwen preview` command
 *
 * Preview the production build locally.
 *
 * @example
 * ```bash
 * gwen preview
 * gwen preview --port 4174
 * ```
 */

import { defineCommand } from 'citty';
import { setLogLevel, logger } from '../utils/logger.js';
import { GLOBAL_ARGS } from '../utils/args.js';
import { DEFAULT_PORT_PREVIEW, ExitCode } from '../utils/constants.js';
import { parseError } from '../core/types/guards.js';

function parsePort(input: unknown): number {
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Port must be between 1024 and 65535');
  }
  return port;
}

export default defineCommand({
  meta: {
    name: 'preview',
    description: 'Preview production build',
  },
  args: {
    ...GLOBAL_ARGS,
    port: {
      type: 'string',
      alias: 'p',
      description: 'Preview server port',
      default: String(DEFAULT_PORT_PREVIEW),
    },
  },
  async run({ args }) {
    setLogLevel({ verbose: args.verbose as boolean, debug: args.debug as boolean });

    // Validate port with lightweight runtime checks
    let port: number;
    try {
      port = parsePort(args.port);
    } catch (error: unknown) {
      logger.error('Invalid port:', parseError(error));
      process.exit(ExitCode.ERROR_VALIDATION);
    }

    logger.info(`Starting preview server on port ${port}...`);

    const { preview } = await import('vite');
    const server = await preview({
      root: process.cwd(),
      configFile: false,
      preview: { port },
    });

    const localUrls = server.resolvedUrls?.local ?? [];
    if (localUrls.length > 0) {
      logger.success(`Preview ready at ${localUrls[0]}`);
    } else {
      const addr = server.httpServer?.address();
      if (addr && typeof addr === 'object') {
        const host = addr.address === '::' ? 'localhost' : addr.address;
        logger.success(`Preview ready at http://${host}:${addr.port}`);
      }
    }
  },
});
