// Re-export public API from plugin and support modules
export type {
  DebugMetrics,
  DebugPluginConfig,
  DebugOverlayConfig,
  FpsDropConfig,
} from './types.js';
export type { DebugService, DebugPluginServices } from './plugin/index.js';
export { DebugPlugin } from './plugin/index.js';

// Side-effect: augments GwenProvides with 'debug' key, enabling typed provide/inject.
export * from './augment.js';
export { useDebug } from './composables.js';
