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
  f32: { type: 'f32', byteLength: 4, read: 'getFloat32', write: 'setFloat32' },
  f64: { type: 'f64', byteLength: 8, read: 'getFloat64', write: 'setFloat64' },
  i32: { type: 'i32', byteLength: 4, read: 'getInt32', write: 'setInt32' },
  i64: { type: 'i64', byteLength: 8, read: 'getBigInt64', write: 'setBigInt64' },
  u32: { type: 'u32', byteLength: 4, read: 'getUint32', write: 'setUint32' },
  u64: { type: 'u64', byteLength: 8, read: 'getBigUint64', write: 'setBigUint64' },
  bool: { type: 'bool', byteLength: 1, read: 'getInt8', write: 'setInt8' }, // 0 = false, 1 = true
  string: { type: 'string', byteLength: 4, read: 'getString', write: 'setString' },
} as const;

export type SchemaType = typeof Types[keyof typeof Types];

export interface ComponentSchema {
  [field: string]: SchemaType;
}

export interface SchemaLayout<T> {
  byteLength: number;
  hasString: boolean;
  serialize?: (data: T, view: DataView) => number;
  deserialize?: (view: DataView) => T;
}

import { GlobalStringPool } from './string-pool.js';

export function computeSchemaLayout<T>(schema: ComponentSchema): Readonly<SchemaLayout<T>> {
  let offset = 0;
  const layout = new Map<string, { type: keyof typeof Types, offset: number, byteLength: number }>();

  for (const [key, typeObj] of Object.entries(schema)) {
    // Si c'est une string, on force un fallback car le tableau doit avoir une taille dynamique/illisible via DataView natif
    const t = typeObj as any;

    // Pour chaque propriété du schema, on note son offset et on incrémente l'offset global
    layout.set(key, { type: t.type, offset, byteLength: t.byteLength });
    offset += t.byteLength;
  }

  // Le `byteLength` de The schema est l'offset final
  const totalByteLength = offset;

  // Fabriquer les fonctions serialize/deserialize s'il n'y a PAS de strings
  // Car les strings réclament du TextDecoder/Encoder
  const order = Array.from(layout.entries());

  const serialize = (data: any, view: DataView) => {
    let bytesWritten = 0;
    for (const [key, meta] of order) {
      const val = data[key];
      if (meta.type === 'bool') {
        view.setInt8(meta.offset, val ? 1 : 0);
      } else if (meta.type === 'string') {
        const strId = GlobalStringPool.intern(val as string);
        view.setInt32(meta.offset, strId, true);
      } else {
        const writeFn = Types[meta.type].write as keyof DataView;
        (view as any)[writeFn](meta.offset, val, true);
      }
      bytesWritten += meta.byteLength;
    }
    return bytesWritten;
  };

  const deserialize = (view: DataView) => {
    const obj: any = {};
    for (const [key, meta] of order) {
      if (meta.type === 'bool') {
        obj[key] = view.getInt8(meta.offset) !== 0;
      } else if (meta.type === 'string') {
        const strId = view.getInt32(meta.offset, true);
        obj[key] = GlobalStringPool.get(strId);
      } else {
        const readFn = Types[meta.type].read as keyof DataView;
        obj[key] = (view as any)[readFn](meta.offset, true);
      }
    }
    return obj;
  };

  return {
    byteLength: totalByteLength,
    hasString: false, // Plus de fallback, tout est gérable par StringPool
    serialize: serialize as (data: T, view: DataView) => number,
    deserialize: deserialize as (view: DataView) => T
  };
}

// Maps SchemaType to actual TypeScript types
export type InferSchemaType<T extends SchemaType> =
  T['type'] extends 'bool' ? boolean :
  T['type'] extends 'string' ? string :
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

/** Corps d'un ComponentDefinition sans le `name` — utilisé par la forme factory. */
export type ComponentBody<S extends ComponentSchema> = Omit<ComponentDefinition<S>, 'name'>;

/**
 * Defines an ECS component schema — deux syntaxes supportées.
 *
 * **Forme 1 — objet direct** :
 * ```ts
 * export const Position = defineComponent({
 *   name: 'position',
 *   schema: { x: Types.f32, y: Types.f32 },
 * });
 * ```
 *
 * **Forme 2 — factory** (schéma calculé dynamiquement) :
 * ```ts
 * export const Position = defineComponent('position', () => ({
 *   schema: { x: Types.f32, y: Types.f32 },
 * }));
 * ```
 */
// Surcharge 1 — objet direct
export function defineComponent<S extends ComponentSchema>(
  config: ComponentDefinition<S>
): ComponentDefinition<S>;

// Surcharge 2 — factory OBLIGATOIRE
export function defineComponent<S extends ComponentSchema>(
  name: string,
  factory: () => ComponentBody<S>
): ComponentDefinition<S>;

// Implémentation
export function defineComponent<S extends ComponentSchema>(
  nameOrConfig: string | ComponentDefinition<S>,
  factory?: () => ComponentBody<S>,
): ComponentDefinition<S> {
  if (typeof nameOrConfig === 'string') {
    return { name: nameOrConfig, ...factory!() };
  }
  return nameOrConfig;
}
