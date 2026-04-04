// Re-export public API from plugin and support modules
export type { DebugMetrics, DebugPluginConfig, DebugOverlayConfig, FpsDropConfig } from './types';
export type { DebugService, DebugPluginServices } from './plugin/index';
export { DebugPlugin } from './plugin/index';

// Side-effect: augments GwenProvides with 'debug' key, enabling typed provide/inject.
export * from './augment';
export { useDebug } from './composables';
