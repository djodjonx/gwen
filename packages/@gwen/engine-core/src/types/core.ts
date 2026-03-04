/**
 * @file Core Type Definitions
 *
 * Fundamental types with zero dependencies.
 * These are the bedrock types that everything else builds on.
 *
 * @internal Do not export directly; use types.ts barrel export
 */

/**
 * Entity identifier — a packed integer combining slot index and generation.
 * Format: (generation << 20) | (index & 0xFFFFF)
 *
 * @see Engine._addComponentInternal for packing/unpacking
 */
export type EntityId = number & { readonly __brand: 'EntityId' };

/**
 * Component type identifier — string name of a component type.
 * Examples: 'Transform', 'Velocity', 'Health'
 */
export type ComponentType = string & { readonly __brand: 'ComponentType' };

/**
 * Plugin name — unique identifier for a plugin.
 * Must be unique per engine instance.
 */
export type PluginName = string & { readonly __brand: 'PluginName' };
