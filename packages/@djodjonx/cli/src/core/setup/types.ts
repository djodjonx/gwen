// packages/@djodjonx/cli/src/core/setup/types.ts
import type { GwenOptions } from '@djodjonx/gwen-schema';

/**
 * Logger injecté dans le contexte setup d'un plugin.
 * `error()` retourne void — l'implémentation CLI lance une GwenSetupError,
 * mais le type reste mockable avec vi.fn() dans les tests.
 */
export interface GwenModuleLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Contexte passé à la fonction setup() de chaque plugin.
 * Disponible uniquement côté CLI (Node.js) — jamais dans le bundle navigateur.
 */
export interface GwenModuleContext {
  /** Config GWEN résolue du projet — `plugins[]` contient tous les plugins déclarés. */
  config: GwenOptions;
  logger: GwenModuleLogger;
}

/** Contrat d'un fichier `*.setup.ts` exporté par un package GWEN. */
export interface GwenPluginSetup {
  setup(ctx: GwenModuleContext): void | Promise<void>;
}
