/**
 * `gwen add` command
 *
 * Installs a GWEN module package with the detected package manager and
 * registers it in `gwen.config.ts` automatically.
 *
 * @example
 * ```bash
 * gwen add @gwenjs/physics
 * gwen add @gwenjs/audio --dev
 * ```
 */

import { defineCommand } from 'citty';
import { logger } from '../utils/logger.js';
import { runInstall } from '../utils/package-manager.js';
import { appendModuleToConfig } from '../utils/config-writer.js';

/** Named export consumed by bin.ts and tests. */
export const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Install a module and register it in gwen.config.ts',
  },
  args: {
    module: {
      type: 'positional',
      description: 'Module package name',
      required: true,
    },
    dev: {
      type: 'boolean',
      description: 'Install as devDependency',
      default: false,
    },
  },
  async run({ args }) {
    const moduleName = args.module as string;
    const isDev = args.dev as boolean;

    logger.info(`Installing ${moduleName} …`);

    try {
      await runInstall([moduleName], { dev: isDev });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[GWEN:add] Failed to install ${moduleName}: ${message}`);
      process.exit(1);
    }

    logger.info(`Registering ${moduleName} in gwen.config.ts …`);

    try {
      await appendModuleToConfig(moduleName);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[GWEN:add] Failed to register ${moduleName} in config: ${message}`);
      process.exit(1);
    }

    logger.success(`✓ ${moduleName} installed and registered.`);
  },
});
