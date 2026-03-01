/**
 * @gwen/cli — Point d'entrée public
 */
export { findConfigFile, parseConfigFile } from './config-parser.js';
export type { EngineConfigParsed, PluginInfo } from './config-parser.js';

export { build } from './builder.js';
export type { BuildOptions, BuildResult, WasmManifest } from './builder.js';

export { prepare } from './prepare.js';
export type { PrepareOptions, PrepareResult } from './prepare.js';

export { dev } from './dev.js';
export type { DevOptions } from './dev.js';

export { buildViteConfig } from './vite-config-builder.js';
export type { ViteConfigOptions } from './vite-config-builder.js';
