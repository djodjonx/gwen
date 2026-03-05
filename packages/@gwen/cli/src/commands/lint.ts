/**
 * `gwen lint` command
 *
 * Lint source code with oxlint.
 * Can auto-fix issues with --fix flag.
 *
 * @example
 * ```bash
 * gwen lint
 * gwen lint --fix
 * gwen lint --fix --verbose
 * ```
 */

import { defineCommand } from 'citty';
import { setLogLevel, logger } from '../utils/logger.js';
import { GLOBAL_ARGS } from '../utils/args.js';
import { lint as coreLint } from '../core/lint.js';

export default defineCommand({
  meta: {
    name: 'lint',
    description: 'Lint source code with oxlint',
  },
  args: {
    ...GLOBAL_ARGS,
    fix: {
      type: 'boolean',
      description: 'Auto-fix lint errors',
    },
    path: {
      type: 'string',
      description: 'Path to lint',
      default: 'src',
    },
  },
  async run({ args }) {
    setLogLevel({ verbose: args.verbose as boolean, debug: args.debug as boolean });

    logger.debug('Starting lint');

    const result = await coreLint({
      fix: args.fix as boolean,
      path: args.path as string,
    });

    if (result.output) console.log(result.output);

    if (!result.success) {
      process.exit(result.exitCode);
    }

    logger.success('Linting complete');
  },
});
