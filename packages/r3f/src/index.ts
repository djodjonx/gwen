// New modular API (RFC-001 GwenEngine-typed)
export { GwenProvider } from './GwenProvider.js';
export type { GwenProviderProps } from './GwenProvider.js';
export { GwenCanvas } from './GwenCanvas.js';
export type { GwenCanvasProps } from './GwenCanvas.js';
export { GwenLoop } from './GwenLoop.js';
export { useGwenEngine } from './context.js';
export { useGwenQuery, useGwenComponent } from './hooks.js';

// Legacy adapter — kept for backward compatibility (GwenEngineLike-typed API).
// Import from './adapter' directly if you need the legacy hooks.
export {
  useGwenService,
  usePhysicsBodyState,
  useEvent,
  useQuery,
  useComponentValue,
  useEntityTransform,
} from './adapter.js';
export type {
  GwenEngineLike,
  GwenProviderProps as LegacyGwenProviderProps,
  TransformLike,
} from './adapter.js';
