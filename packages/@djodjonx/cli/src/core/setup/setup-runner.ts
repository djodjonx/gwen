// packages/@djodjonx/cli/src/core/setup/setup-runner.ts
import type { GwenOptions } from '@djodjonx/gwen-schema';
import type { GwenModuleContext, GwenPluginSetup } from './types.js';
import { logger as cliLogger } from '../../utils/logger.js';

/**
 * Erreur levée quand un plugin appelle ctx.logger.error() dans son setup.
 * Attrapée dans commands/prepare.ts pour process.exit(1) propre.
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
 * Exécute les hooks setup() de tous les plugins déclarés dans la config.
 *
 * Pour chaque plugin :
 * 1. Résout `<packageName>/setup` via exports conditionnels Node.js
 * 2. Si le sous-module n'existe pas → continue silencieusement
 * 3. Exécute `mod.setup(ctx)` avec un logger qui throw GwenSetupError sur error()
 *
 * @param _projectDir  Répertoire racine (réservé — résolution via Node.js module)
 * @param config       Config GWEN résolue
 * @param importer     Fonction d'import injectable. Défaut : `(id) => import(id)`.
 *                     Injecter un faux loader dans les tests (évite vi.mock absolu).
 *
 * @throws {GwenSetupError} si un plugin appelle ctx.logger.error()
 * @throws {Error} pour toute autre erreur (syntaxe, runtime) — non interceptée
 */
export async function runPluginSetups(
  _projectDir: string,
  config: GwenOptions,
  importer: (id: string) => Promise<unknown> = (id) => import(id),
): Promise<void> {
  for (const plugin of config.plugins ?? []) {
    const pluginName = plugin.name ?? 'unknown';
    // Priorité : plugin.packageName (si présent) > plugin.name
    const packageName = ((plugin as any).packageName as string | undefined) ?? plugin.name;

    if (!packageName) continue;

    let mod: GwenPluginSetup;
    try {
      mod = (await importer(`${packageName}/setup`)) as GwenPluginSetup;
    } catch (err: any) {
      if (
        err.code === 'ERR_MODULE_NOT_FOUND' ||
        err.code === 'MODULE_NOT_FOUND' ||
        err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
      ) {
        cliLogger.trace(`No setup module for ${pluginName}`);
        continue;
      }
      throw err; // vraie erreur — remonter
    }

    if (typeof mod.setup !== 'function') continue;

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
    await mod.setup(ctx);
  }
}
