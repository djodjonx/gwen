/**
 * QueryResult — runtime iterable returned to system onUpdate() when a static `query` descriptor
 * is declared on the system.
 *
 * The RFC-008 Vite transform replaces this runtime implementation with pure TypedArray
 * offsets in production builds. This module is the fallback / dev-mode path.
 */

import type { EntityId } from '../types/entity';
import type { ComponentDefinition, ComponentSchema, InferComponent } from '../schema';
import type { EngineAPI } from '../types/engine-api';

// ── Public types ──────────────────────────────────────────────────────────────

/** A single component definition — shorthand for use in query descriptors. */
export type ComponentDef = ComponentDefinition<ComponentSchema>;

/**
 * Descriptor-based query — fine-grained filter over the entity set.
 *
 * @example
 * ```ts
 * query: { all: [Position, Velocity], none: [Frozen] }
 * ```
 */
export interface SystemQueryDescriptor {
  /** Entities that have ALL of these components. */
  all?: ComponentDef[];
  /** Entities that have AT LEAST ONE of these components. */
  any?: ComponentDef[];
  /** Entities that have NONE of these components. */
  none?: ComponentDef[];
  /**
   * Entities that carry this tag (marker-component name).
   * Tags are zero-data components registered as strings.
   */
  tag?: string;
}

/**
 * Static query declaration for a system.
 *
 * Short form: `ComponentDef[]` — treated as `{ all: [...] }`.
 * Long form: `SystemQueryDescriptor` — explicit filter fields.
 */
export type SystemQuery = ComponentDef[] | SystemQueryDescriptor;

/**
 * Per-entity accessor passed as `entities` in `onUpdate(api, dt, entities)`.
 *
 * Provides typed `get/set/has` component access without repeating the entity id.
 */
export interface EntityAccessor {
  /** The entity's packed 64-bit id. */
  readonly id: EntityId;

  /**
   * Read a component value for this entity.
   * Returns `undefined` if the component is not attached.
   */
  get<S extends ComponentSchema>(
    def: ComponentDefinition<S>,
  ): InferComponent<typeof def> | undefined;

  /**
   * Write (patch) component fields for this entity.
   * Merges `data` onto the existing component value.
   */
  set<S extends ComponentSchema>(
    def: ComponentDefinition<S>,
    data: Partial<InferComponent<typeof def>>,
  ): void;

  /** Return `true` if this entity has the given component. */
  has(def: ComponentDef): boolean;
}

/**
 * Iterable collection of `EntityAccessor` instances resolved from a system query.
 *
 * Iterable in a `for...of` loop; also exposes `length` and `toArray()`.
 */
export interface QueryResult extends Iterable<EntityAccessor> {
  /** Number of matching entities this frame. */
  readonly length: number;

  /** Return a snapshot of matching entity ids. Allocates — avoid in hot loops. */
  toArray(): EntityId[];
}

// ── Runtime implementation ────────────────────────────────────────────────────

class EntityAccessorImpl implements EntityAccessor {
  constructor(
    public readonly id: EntityId,
    private readonly _api: EngineAPI,
  ) {}

  get<S extends ComponentSchema>(
    def: ComponentDefinition<S>,
  ): InferComponent<typeof def> | undefined {
    return this._api.component.get(this.id, def) as InferComponent<typeof def> | undefined;
  }

  set<S extends ComponentSchema>(
    def: ComponentDefinition<S>,
    data: Partial<InferComponent<typeof def>>,
  ): void {
    this._api.component.set(this.id, def, data as any);
  }

  has(def: ComponentDef): boolean {
    return this._api.component.has(this.id, def);
  }
}

export class QueryResultImpl implements QueryResult {
  private readonly _ids: readonly EntityId[];
  private readonly _api: EngineAPI;

  constructor(ids: EntityId[], api: EngineAPI) {
    this._ids = ids;
    this._api = api;
  }

  get length(): number {
    return this._ids.length;
  }

  [Symbol.iterator](): Iterator<EntityAccessor> {
    let idx = 0;
    const ids = this._ids;
    const api = this._api;
    return {
      next(): IteratorResult<EntityAccessor> {
        if (idx < ids.length) {
          return { value: new EntityAccessorImpl(ids[idx++], api), done: false };
        }
        return { value: undefined as any, done: true };
      },
    };
  }

  toArray(): EntityId[] {
    return [...this._ids];
  }
}

// ── Query resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a `SystemQuery` descriptor into a `QueryResult` using the engine API.
 *
 * Execution order:
 * 1. `all` — primary filter via `api.query()` (WASM-accelerated)
 * 2. `any` — secondary JS filter (at least one of these components)
 * 3. `none` — exclusion JS filter (must not have any of these)
 * 4. `tag`  — marker-component filter
 */
export function buildQueryResult(query: SystemQuery, api: EngineAPI): QueryResult {
  const ids = resolveSystemQueryIds(query, api);
  return new QueryResultImpl(ids, api);
}

/**
 * @internal Resolve query to raw EntityId[]. Exported for plugin-manager use.
 */
export function resolveSystemQueryIds(query: SystemQuery, api: EngineAPI): EntityId[] {
  const desc: SystemQueryDescriptor = Array.isArray(query) ? { all: query } : query;

  // 1. Primary filter — 'all' components (WASM query cache, O(n) worst case)
  let results: EntityId[];
  if (desc.all && desc.all.length > 0) {
    results = api.query(desc.all);
  } else {
    // No 'all' constraint — start from the complete alive set
    results = api.query([]);
  }

  // 2. 'any' filter — keep entities that have at least one of these
  if (desc.any && desc.any.length > 0) {
    const anyDefs = desc.any;
    results = results.filter((id) => anyDefs.some((def) => api.component.has(id, def)));
  }

  // 3. 'none' filter — exclude entities that have any of these
  if (desc.none && desc.none.length > 0) {
    const noneDefs = desc.none;
    results = results.filter((id) => !noneDefs.some((def) => api.component.has(id, def)));
  }

  // 4. 'tag' filter — tag is a zero-data marker component referenced by string
  if (desc.tag) {
    const tag = desc.tag;
    results = results.filter((id) => api.component.has(id, tag));
  }

  return results;
}
