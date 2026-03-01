/**
 * GWEN Component Schema DSL
 *
 * Defines the static data structure of ECS components.
 * This DSL serves two purposes:
 * 1. Runtime TypeScript validation and type inference.
 * 2. Build-time WASM memory layout generation (by @gwen/cli).
 *
 * @example
 * ```typescript
 * import { defineComponent, Types, InferComponent } from '@gwen/engine-core';
 *
 * export const Health = defineComponent({
 *   name: 'Health',
 *   schema: {
 *     current: Types.f32,
 *     max: Types.f32,
 *     isAlive: Types.bool
 *   }
 * });
 *
 * // Automatically infers: { current: number, max: number, isAlive: boolean }
 * export type HealthType = InferComponent<typeof Health>;
 * ```
 */

// Supported scalar types for WASM memory layout
export const Types = {
  f32: 'f32',
  f64: 'f64',
  i32: 'i32',
  i64: 'i64',
  u32: 'u32',
  u64: 'u64',
  bool: 'bool',
  string: 'string', // Stored as UTF-8 offset in WASM linear memory
} as const;

export type SchemaType = typeof Types[keyof typeof Types];

export interface ComponentSchema {
  [field: string]: SchemaType;
}

// Maps SchemaType to actual TypeScript types
export type InferSchemaType<T extends SchemaType> =
  T extends 'bool' ? boolean :
  T extends 'string' ? string :
  number; // All numeric types (f32, i32, u64...) map to TS number

/**
 * Extracts the TypeScript interface from a ComponentDefinition.
 */
export type InferComponent<D extends ComponentDefinition<any>> = {
  [K in keyof D['schema']]: InferSchemaType<D['schema'][K]>;
};

export interface ComponentDefinition<S extends ComponentSchema> {
  readonly name: string;
  readonly schema: S;
}

/**
 * Defines an ECS component schema.
 * This function returns the definition strictly typed, allowing `InferComponent` to work.
 */
export function defineComponent<S extends ComponentSchema>(config: {
  name: string;
  schema: S;
}): ComponentDefinition<S> {
  return {
    name: config.name,
    schema: config.schema,
  };
}
