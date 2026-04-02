import type { GwenOptions } from '@gwenjs/schema';
import type { GwenModuleContext, GwenPluginSetup } from './types.js';
import { logger as cliLogger } from '../../utils/logger.js';

function getNodeImportErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code } = error as Record<string, unknown>;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Error thrown when a plugin setup uses `ctx.logger.error()`.
 *
 * The prepare and dev command paths catch this error and stop with a clean,
 * plugin-scoped message.
 */
export class GwenSetupError extends Error {
  constructor(
    public readonly pluginName: string,
    message: string,
  ) {
    super(message);
    this.name = 'GwenSetupError';
  }
}

/**
 * Execute setup hooks for each declared runtime plugin.
 *
 * For each plugin, this function:
 * 1. Resolves `<packageName>/setup` through Node.js package exports.
 * 2. Silently skips plugins without a setup entry.
 * 3. Invokes `mod.setup(ctx)` with a logger that throws `GwenSetupError`
 *    when `error()` is called.
 *
 * @param _projectDir Reserved project root parameter used by command callers.
 * @param config Fully resolved GWEN configuration.
 * @param importer Injectable import function used by tests.
 * @throws GwenSetupError when setup emits a blocking plugin error.
 * @throws Error for unexpected module resolution or runtime failures.
 */
export async function runPluginSetups(
  _projectDir: string,
  config: GwenOptions,
  importer: (id: string) => Promise<unknown> = (id) => import(id),
): Promise<void> {
  for (const plugin of config.plugins ?? []) {
    const pluginName = plugin.name ?? 'unknown';
    // Priority: explicit packageName first, then fallback to plugin name.
    const packageName = plugin.packageName ?? plugin.name;
    if (!packageName) continue;

    let mod: unknown;
    try {
      mod = await importer(`${packageName}/setup`);
    } catch (err) {
      const code = getNodeImportErrorCode(err);
      if (
        code === 'ERR_MODULE_NOT_FOUND' ||
        code === 'MODULE_NOT_FOUND' ||
        code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
      ) {
        cliLogger.trace(`No setup module for ${pluginName}`);
        continue;
      }
      throw err;
    }

    if (typeof (mod as GwenPluginSetup).setup !== 'function') continue;

    const ctx: GwenModuleContext = {
      config,
      logger: {
        info: (msg) => cliLogger.info(`[${pluginName}] ${msg}`),
        warn: (msg) => cliLogger.warn(`[${pluginName}] ${msg}`),
        error: (msg) => {
          cliLogger.error(`[${pluginName}] ${msg}`);
          throw new GwenSetupError(pluginName, msg);
        },
      },
    };

    cliLogger.debug(`Running setup for ${pluginName}…`);
    await (mod as GwenPluginSetup).setup(ctx);
  }
}
