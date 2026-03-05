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
  f32: {
    type: 'f32' as const,
    byteLength: 4,
    read: 'getFloat32' as const,
    write: 'setFloat32' as const,
  },
  f64: {
    type: 'f64' as const,
    byteLength: 8,
    read: 'getFloat64' as const,
    write: 'setFloat64' as const,
  },
  i32: {
    type: 'i32' as const,
    byteLength: 4,
    read: 'getInt32' as const,
    write: 'setInt32' as const,
  },
  i64: {
    type: 'i64' as const,
    byteLength: 8,
    read: 'getBigInt64' as const,
    write: 'setBigInt64' as const,
  },
  u32: {
    type: 'u32' as const,
    byteLength: 4,
    read: 'getUint32' as const,
    write: 'setUint32' as const,
  },
  u64: {
    type: 'u64' as const,
    byteLength: 8,
    read: 'getBigUint64' as const,
    write: 'setBigUint64' as const,
  },
  bool: {
    type: 'bool' as const,
    byteLength: 1,
    read: 'getInt8' as const,
    write: 'setInt8' as const,
  },
  string: {
    type: 'string' as const,
    byteLength: 4,
    read: 'getString' as const,
    write: 'setString' as const,
  },
  /**
   * Persistent string — survives scene transitions.
   *
   * **⚠️ Use sparingly!** Only for cross-scene data like:
   * - Player names from save files
   * - User preferences
   * - Configuration loaded once at startup
   *
   * Default to `Types.string` (scene-scoped) unless you explicitly need persistence.
   */
  persistentString: {
    type: 'string' as const,
    byteLength: 4,
    read: 'getString' as const,
    write: 'setString' as const,
    isPersistent: true, // Flag for computeSchemaLayout to select the persistent pool
  },
};

export type SchemaType = (typeof Types)[keyof typeof Types];

export interface ComponentSchema {
  [field: string]: SchemaType;
}

export interface SchemaLayout<T> {
  byteLength: number;
  hasString: boolean;
  serialize?: (data: T, view: DataView) => number;
  deserialize?: (view: DataView) => T;
}

// ── Internal types for serialization ──────────────────────────────────────────

/**
 * Numeric schema types whose DataView accessors accept (offset, littleEndian).
 */
type NumericSchemaTypeName = 'f32' | 'f64' | 'i32' | 'u32';

/**
 * DataView accessor methods for numeric types — strict binding.
 */
type NumericReadMethod = 'getFloat32' | 'getFloat64' | 'getInt32' | 'getUint32';
type NumericWriteMethod = 'setFloat32' | 'setFloat64' | 'setInt32' | 'setUint32';

/**
 * 64-bit integer schema types — require bigint.
 */
type BigIntSchemaTypeName = 'i64' | 'u64';
type BigIntReadMethod = 'getBigInt64' | 'getBigUint64';
type BigIntWriteMethod = 'setBigInt64' | 'setBigUint64';

/** Possible JavaScript value for a schema field */
type FieldValue = number | bigint | boolean | string;

interface FieldMeta {
  type: SchemaType['type'];
  offset: number;
  byteLength: number;
}

import { GlobalStringPoolManager } from './utils/string-pool.js';

export function computeSchemaLayout<T extends Record<string, FieldValue>>(
  schema: ComponentSchema,
): Readonly<SchemaLayout<T>> {
  let offset = 0;
  const layout = new Map<string, FieldMeta>();

  for (const [key, typeObj] of Object.entries(schema)) {
    layout.set(key, { type: typeObj.type, offset, byteLength: typeObj.byteLength });
    offset += typeObj.byteLength;
  }

  const totalByteLength = offset;
  const order = Array.from(layout.entries());

  const serialize = (data: T, view: DataView): number => {
    let bytesWritten = 0;
    for (const [key, meta] of order) {
      const val = data[key as keyof T];
      if (meta.type === 'bool') {
        view.setInt8(meta.offset, val ? 1 : 0);
      } else if (meta.type === 'string') {
        // Select pool based on isPersistent flag
        const typeObj = schema[key];
        const pool = (typeObj as any).isPersistent
          ? GlobalStringPoolManager.persistent
          : GlobalStringPoolManager.scene;
        const strId = pool.intern(val as string);
        view.setInt32(meta.offset, strId, true);
      } else if (meta.type === 'i64' || meta.type === 'u64') {
        const method = Types[meta.type as BigIntSchemaTypeName].write as BigIntWriteMethod;
        view[method](meta.offset, BigInt(val as number), true);
      } else {
        const method = Types[meta.type as NumericSchemaTypeName].write as NumericWriteMethod;
        view[method](meta.offset, val as number, true);
      }
      bytesWritten += meta.byteLength;
    }
    return bytesWritten;
  };

  const deserialize = (view: DataView): T => {
    const obj: Record<string, FieldValue> = {};
    for (const [key, meta] of order) {
      if (meta.type === 'bool') {
        obj[key] = view.getInt8(meta.offset) !== 0;
      } else if (meta.type === 'string') {
        const strId = view.getInt32(meta.offset, true);
        // Select pool based on isPersistent flag
        const typeObj = schema[key];
        const pool = (typeObj as any).isPersistent
          ? GlobalStringPoolManager.persistent
          : GlobalStringPoolManager.scene;
        obj[key] = pool.get(strId);
      } else if (meta.type === 'i64' || meta.type === 'u64') {
        const method = Types[meta.type as BigIntSchemaTypeName].read as BigIntReadMethod;
        obj[key] = view[method](meta.offset, true);
      } else {
        const method = Types[meta.type as NumericSchemaTypeName].read as NumericReadMethod;
        obj[key] = view[method](meta.offset, true);
      }
    }
    return obj as T;
  };

  return {
    byteLength: totalByteLength,
    hasString: order.some(([, m]) => m.type === 'string'),
    serialize,
    deserialize,
  };
}

// Maps SchemaType to actual TypeScript types
export type InferSchemaType<T extends SchemaType> = T['type'] extends 'bool'
  ? boolean
  : T['type'] extends 'string'
    ? string
    : T['type'] extends 'i64' | 'u64'
      ? bigint
      : number;

/**
 * Extracts the TypeScript interface from a ComponentDefinition.
 */
export type InferComponent<D extends ComponentDefinition<ComponentSchema>> = {
  [K in keyof D['schema']]: InferSchemaType<D['schema'][K]>;
};

export interface ComponentDefinition<S extends ComponentSchema> {
  readonly name: string;
  readonly schema: S;
}

/**
 * Body of a ComponentDefinition without the `name` — used by factory form.
 */
export type ComponentBody<S extends ComponentSchema> = Omit<ComponentDefinition<S>, 'name'>;

/**
 * Define an ECS component schema — two syntaxes supported.
 *
 * **Form 1 — direct object**:
 * ```ts
 * export const Position = defineComponent({
 *   name: 'position',
 *   schema: { x: Types.f32, y: Types.f32 },
 * });
 * ```
 *
 * **Form 2 — factory (required for dynamic schema)**:
 * ```ts
 * export const Position = defineComponent('position', () => ({
 *   schema: { x: Types.f32, y: Types.f32 },
 * }));
 * ```
 *
 * @param nameOrConfig Either a string name or a full ComponentDefinition
 * @param factory Optional factory function (required for Form 2)
 * @returns The component definition with schema and name
 *
 * @example
 * ```ts
 * export const Health = defineComponent({
 *   name: 'health',
 *   schema: { current: Types.f32, max: Types.f32 }
 * });
 * type HealthData = InferComponent<typeof Health>;
 * ```
 */
export function defineComponent<S extends ComponentSchema>(
  config: ComponentDefinition<S>,
): ComponentDefinition<S>;

export function defineComponent<S extends ComponentSchema>(
  name: string,
  factory: () => ComponentBody<S>,
): ComponentDefinition<S>;

export function defineComponent<S extends ComponentSchema>(
  nameOrConfig: string | ComponentDefinition<S>,
  factory?: () => ComponentBody<S>,
): ComponentDefinition<S> {
  if (typeof nameOrConfig === 'string') {
    return { name: nameOrConfig, ...factory!() };
  }
  return nameOrConfig;
}
