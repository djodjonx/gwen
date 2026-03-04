/**
 * WASM Bridge — Interface between @gwen/engine-core (TypeScript) and gwen_core.wasm (Rust).
 *
 * The Rust/WASM core is MANDATORY — no TypeScript fallback exists.
 * Call `await initWasm()` BEFORE creating the Engine, or an error is thrown.
 *
 * @example
 * ```typescript
 * await initWasm();          // Auto-resolves from @gwen/engine-core/wasm/
 * const engine = getEngine();
 * engine.start();
 * ```
 */

// ── wasm-bindgen generated module types ───────────────────────────────────────

/**
 * Opaque entity handle from Rust (index + generation pair).
 * Both fields must be passed back to safely detect stale references.
 */
export interface WasmEntityId {
  readonly index: number;
  readonly generation: number;
}

/** Minimal interface for the wasm-bindgen generated gwen_core module */
export interface GwenCoreWasm {
  Engine: {
    new (maxEntities: number): WasmEngine;
  };
  /**
   * The WASM linear memory exported by gwen-core.
   *
   * wasm-bindgen always exports the memory object as `wasm.memory` on the
   * generated glue module. We expose it here so the TypeScript layer can:
   *   1. Build `DataView` / `TypedArray` views for debug tools.
   *   2. Detect `memory.grow()` events: when Rust allocates enough to
   *      trigger a grow, the underlying `ArrayBuffer` is replaced. Any
   *      previously constructed JS views become "detached" and must be
   *      recreated.  `getLinearMemory()` on the bridge always returns the
   *      live `WebAssembly.Memory` object, so callers should re-wrap
   *      `memory.buffer` on every frame rather than caching the buffer.
   */
  memory?: WebAssembly.Memory;
}

export interface WasmEngine {
  // ── Entity ──────────────────────────────────────────────────────────────

  /** Create a new entity and return its index + generation handle. */
  create_entity(): WasmEntityId;
  /**
   * Destroy an entity slot by index and generation.
   * @returns `false` if the (index, generation) pair is stale (already dead).
   */
  delete_entity(index: number, generation: number): boolean;
  /**
   * Check whether an entity slot is still alive.
   * @returns `false` if the generation does not match (slot was reused).
   */
  is_alive(index: number, generation: number): boolean;
  /** Return the number of currently alive entities. */
  count_entities(): number;

  // ── Component ────────────────────────────────────────────────────────────

  /**
   * Register a new component type in the Rust ECS.
   * @returns A unique `typeId` (u32) used in all subsequent component calls.
   */
  register_component_type(): number;
  /**
   * Attach or overwrite a component on an entity.
   * @param index      Raw entity slot index.
   * @param generation Entity generation counter (stale-reference guard).
   * @param typeId     Component type ID returned by `register_component_type`.
   * @param data       Raw bytes — must match the layout registered for `typeId`.
   * @returns `false` if the entity is dead.
   */
  add_component(index: number, generation: number, typeId: number, data: Uint8Array): boolean;
  /**
   * Remove a component from an entity.
   * @returns `false` if the entity is dead or did not have the component.
   */
  remove_component(index: number, generation: number, typeId: number): boolean;
  /**
   * Check whether an entity has a specific component type.
   * @returns `false` if the entity is dead or the component is absent.
   */
  has_component(index: number, generation: number, typeId: number): boolean;
  /**
   * Read raw component bytes from the Rust ECS.
   * @returns Empty `Uint8Array` if the entity is dead or component is absent.
   */
  get_component_raw(index: number, generation: number, typeId: number): Uint8Array;

  // ── Query ────────────────────────────────────────────────────────────────

  /**
   * Update the archetype bitmask for an entity slot.
   * Must be called after every `add_component` / `remove_component` so that
   * `query_entities` returns correct results.
   */
  update_entity_archetype(index: number, typeIds: Uint32Array): void;
  /**
   * Remove an entity slot from all query indexes (called before deletion).
   */
  remove_entity_from_query(index: number): void;
  /**
   * Return the raw slot indices of all entities that have ALL of the given
   * component type IDs.
   * @returns Raw slot indices — NOT packed EntityIds.
   *          Callers must call `get_entity_generation` to reconstruct them.
   */
  query_entities(typeIds: Uint32Array): Uint32Array;
  /**
   * Return the current generation counter for a slot index.
   * Used to reconstruct a packed `EntityId` from a raw slot index.
   * @returns `0xFFFFFFFF` if the slot has never been used.
   */
  get_entity_generation(index: number): number;

  // ── Game loop ────────────────────────────────────────────────────────────

  /**
   * Advance the Rust simulation by one frame.
   * @param deltaMs Frame delta time in **milliseconds** (Rust side convention).
   */
  tick(deltaMs: number): void;
  /** Return the total number of frames simulated since engine creation. */
  frame_count(): bigint;
  /** Return the delta time of the last `tick()` call, in seconds. */
  delta_time(): number;
  /** Return the total elapsed time since engine creation, in seconds. */
  total_time(): number;

  // ── Shared memory (WASM plugin bridge) ───────────────────────────────────

  /**
   * Allocate `byteLength` bytes in gwen-core's WASM linear memory.
   * @returns A raw pointer (usize) into WASM linear memory.
   */
  alloc_shared_buffer(byteLength: number): number;
  /**
   * Copy ECS transform data into the shared buffer so WASM plugins can read it.
   * @param ptr    Pointer returned by `alloc_shared_buffer`.
   * @param maxEntities  Number of entity slots to sync.
   */
  sync_transforms_to_buffer(ptr: number, maxEntities: number): void;
  /**
   * Copy transform data from the shared buffer back into the ECS (after WASM plugins write).
   * @param ptr    Pointer returned by `alloc_shared_buffer`.
   * @param maxEntities  Number of entity slots to sync.
   */
  sync_transforms_from_buffer(ptr: number, maxEntities: number): void;

  // ── Stats ────────────────────────────────────────────────────────────────

  /** Return a JSON string with engine runtime metrics (entity count, frame, etc.). */
  stats(): string;
}

// ── Internal state ────────────────────────────────────────────────────────────

let _wasmEngine: WasmEngine | null = null;
let _wasmModule: GwenCoreWasm | null = null;
let _wasmExports: { memory?: WebAssembly.Memory } | null = null; // raw WASM instance exports
let _initPromise: Promise<void> | null = null;
let _maxEntities = 10_000;

/**
 * Base URL for WASM artifacts (auto-resolved in browser, null in Node).
 *
 * Resolution strategy (in order):
 *  1. In browser: /wasm/ relative to current origin.
 *     @gwen/vite-plugin serves this via middleware (dev)
 *     and CLI copies it to dist/wasm/ (build).
 *  2. In Node (SSR/tests): null — initWasm() must receive explicit URL.
 *
 * We avoid new URL('../wasm/', import.meta.url) because in Vite dev mode
 * it produces an @fs/.../.../engine-core/wasm path without trailing slash,
 * resulting in an invalid URL.
 */
const _pkgWasmBase: string | null = (() => {
  if (typeof window !== 'undefined' && typeof location !== 'undefined') {
    // Browser — artifacts always served from /wasm/ by Vite plugin
    return `${location.origin}/wasm/`;
  }
  return null;
})();

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Load and initialize the gwen_core WASM module. **REQUIRED** before any Engine usage.
 *
 * **Without arguments**: Auto-resolves from `@gwen/engine-core/wasm/`
 * (pre-compiled artifacts published in the package — no Rust build needed).
 *
 * @param jsUrl Optional URL to the wasm-bindgen glue (gwen_core.js)
 * @param wasmUrl Optional URL to the WASM binary (gwen_core_bg.wasm)
 * @param maxEntities Max number of entities the engine can track (default: 10,000)
 * @throws {Error} If WASM cannot be loaded or has invalid format
 *
 * @example
 * ```typescript
 * // Standard usage — zero config
 * await initWasm();
 *
 * // Explicit URLs (custom path, CDN, etc.)
 * await initWasm('/custom/gwen_core.js', '/custom/gwen_core_bg.wasm');
 * ```
 */
export async function initWasm(
  jsUrl?: string,
  wasmUrl?: string,
  maxEntities = 10_000,
): Promise<void> {
  if (_wasmEngine) return;
  if (_initPromise) return _initPromise;

  _maxEntities = maxEntities;

  const resolvedJsUrl = jsUrl ?? (_pkgWasmBase ? `${_pkgWasmBase}gwen_core.js` : null);
  const resolvedWasmUrl = wasmUrl ?? (_pkgWasmBase ? `${_pkgWasmBase}gwen_core_bg.wasm` : null);

  if (!resolvedJsUrl) {
    throw new Error(
      '[GWEN] initWasm(): unable to resolve WASM glue URL.\n' +
        'Make sure @gwen/engine-core is correctly installed.',
    );
  }

  _initPromise = (async () => {
    const glue = await loadWasmGlue(resolvedJsUrl);

    const wasmInput = resolvedWasmUrl ? await fetch(resolvedWasmUrl) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const glueAny = glue as any;

    if (typeof glue.default === 'function') {
      // glue.default() returns the raw WASM instance exports (including memory)
      _wasmExports = await glueAny.default({ module_or_path: wasmInput });
    } else if (typeof glue.initSync === 'function') {
      const buf = await (await fetch(resolvedWasmUrl!)).arrayBuffer();
      _wasmExports = glueAny.initSync({ module: buf });
    } else {
      throw new Error('[GWEN] WASM glue has no init() function — corrupted file?');
    }

    if (typeof glue.Engine !== 'function') {
      throw new Error('[GWEN] WASM glue loaded but Engine class not found.');
    }

    _wasmModule = glue as GwenCoreWasm;
    _wasmEngine = new glue.Engine(maxEntities);

    console.log('[GWEN] WASM core loaded — Rust ECS active');
  })().catch((err) => {
    _initPromise = null;
    _wasmEngine = null;
    _wasmModule = null;
    _wasmExports = null;
    throw err;
  });

  return _initPromise;
}

// ── Internal types for DOM-based glue loading ─────────────────────────────────

/**
 * Extended `Window` interface that allows dynamic property access.
 * Used to cache loaded WASM glue modules on the global object.
 */
interface GwenWindow extends Window {
  [key: string]: unknown;
}

declare const window: GwenWindow;

/**
 * Shape of a wasm-bindgen generated ES glue module.
 * The exact exports depend on the wasm-bindgen version and init mode.
 */
interface WasmGlueModule {
  default?: (init: { module_or_path?: Response | undefined }) => Promise<void>;
  initSync?: (init: { module: ArrayBuffer }) => void;
  Engine?: new (maxEntities: number) => WasmEngine;
  [key: string]: unknown;
}

/**
 * Load a WASM ES glue module via a `<script type="module">` injected into the DOM.
 * Works around Vite's restriction on dynamic `import()` for files served from `/public`.
 *
 * The loaded module is cached on `window` under a deterministic key so repeated
 * calls for the same URL are free (no extra network round-trips).
 *
 * @param jsUrl Absolute or root-relative URL to the wasm-bindgen JS glue file.
 * @throws {Error} If called outside a browser environment (no `document`).
 */
async function loadWasmGlue(jsUrl: string): Promise<WasmGlueModule> {
  if (typeof document === 'undefined') {
    throw new Error('[GWEN] initWasm() requires a browser environment (no DOM detected).');
  }

  return new Promise<WasmGlueModule>((resolve, reject) => {
    const key = `__gwenGlue_${jsUrl.replace(/\W/g, '_')}`;

    if (window[key]) {
      resolve(window[key] as WasmGlueModule);
      return;
    }

    const blob = new Blob(
      [
        `import * as glue from '${new URL(jsUrl, location.href).href}';`,
        `window['${key}'] = glue;`,
        `window['${key}__resolve']?.();`,
      ],
      { type: 'text/javascript' },
    );

    const blobUrl = URL.createObjectURL(blob);

    window[`${key}__resolve`] = () => {
      URL.revokeObjectURL(blobUrl);
      script.remove();
      resolve(window[key] as WasmGlueModule);
    };

    const script = document.createElement('script');
    script.type = 'module';
    script.src = blobUrl;
    script.onerror = (e) => {
      URL.revokeObjectURL(blobUrl);
      script.remove();
      reject(new Error(`[GWEN] Unable to load WASM glue: ${jsUrl}\n${e}`));
    };

    document.head.appendChild(script);
  });
}

// ── Public Bridge ─────────────────────────────────────────────────────────────

export interface WasmBridge {
  /** True if Rust/WASM core is initialized and ready. */
  isActive(): boolean;

  /** Direct access to the Rust WasmEngine instance. Throws if not initialized. */
  engine(): WasmEngine;

  // ── Entity ──────────────────────────────────────────────────────────────

  /** Create a new entity and return its packed handle (index + generation). */
  createEntity(): WasmEntityId;
  /**
   * Destroy an entity.
   * @returns `false` if the (index, generation) pair is stale.
   */
  deleteEntity(index: number, generation: number): boolean;
  /**
   * Check whether an entity slot is still alive.
   * @returns `false` if the generation does not match.
   */
  isAlive(index: number, generation: number): boolean;
  /** Return the number of currently alive entities. */
  countEntities(): number;

  // ── Component ────────────────────────────────────────────────────────────

  /**
   * Register a new component type in the Rust ECS.
   * @returns A unique `typeId` (u32) used in all subsequent component calls.
   */
  registerComponentType(): number;
  /**
   * Attach or overwrite a component on an entity.
   * @param index      Raw entity slot index.
   * @param generation Entity generation counter (stale-reference guard).
   * @param typeId     Component type ID returned by `registerComponentType`.
   * @param data       Raw bytes — layout must match what the Rust side expects for `typeId`.
   * @returns `false` if the entity is dead.
   */
  addComponent(index: number, generation: number, typeId: number, data: Uint8Array): boolean;
  /**
   * Remove a component from an entity.
   * @returns `false` if the entity is dead or did not have the component.
   */
  removeComponent(index: number, generation: number, typeId: number): boolean;
  /**
   * Check whether an entity has a specific component type.
   * @returns `false` if the entity is dead or the component is absent.
   */
  hasComponent(index: number, generation: number, typeId: number): boolean;
  /**
   * Read raw component bytes from the Rust ECS.
   * @returns Empty `Uint8Array` if the entity is dead or component is absent.
   */
  getComponentRaw(index: number, generation: number, typeId: number): Uint8Array;

  // ── Query ────────────────────────────────────────────────────────────────

  /**
   * Update the archetype bitmask for an entity.
   * Must be called after every `addComponent` / `removeComponent` so that
   * `queryEntities` returns up-to-date results.
   */
  updateEntityArchetype(index: number, typeIds: number[]): void;
  /**
   * Remove an entity from all query indexes.
   * Must be called just before `deleteEntity`.
   */
  removeEntityFromQuery(index: number): void;
  /**
   * Return the packed `EntityId`s of all entities that have ALL of the given
   * component type IDs.
   *
   * Internally converts raw Rust slot indices to packed TypeScript EntityIds
   * using `getEntityGeneration`.
   */
  queryEntities(typeIds: number[]): number[];
  /**
   * Return the current generation counter for a raw slot index.
   * Used to reconstruct a packed `EntityId` from a WASM-side slot index
   * (e.g. `slotA` / `slotB` from physics collision events).
   */
  getEntityGeneration(index: number): number;

  // ── Game loop ────────────────────────────────────────────────────────────

  /**
   * Advance the Rust simulation by one frame.
   * @param deltaMs Frame delta time in **milliseconds** (Rust side convention).
   */
  tick(deltaMs: number): void;

  // ── Shared memory (WASM plugin bridge) ───────────────────────────────────

  /**
   * Allocate `byteLength` bytes in gwen-core's WASM linear memory.
   * Returns a raw pointer (usize) passed to WASM plugins via `onInit(region)`.
   * Called once by `SharedMemoryManager.create()`.
   */
  allocSharedBuffer(byteLength: number): number;

  /**
   * Copy ECS Transform data → shared buffer so WASM plugins can read it.
   * Called each frame **before** `dispatchWasmStep`.
   */
  syncTransformsToBuffer(ptr: number, maxEntities: number): void;

  /**
   * Copy shared buffer → ECS Transform data after WASM plugins have written it.
   * Called each frame **after** `dispatchWasmStep` and after sentinel checks.
   */
  syncTransformsFromBuffer(ptr: number, maxEntities: number): void;

  /**
   * Return the `WebAssembly.Memory` object exported by `gwen_core.wasm`.
   *
   * ## Why this matters — buffer-detach on `memory.grow()`
   * When Rust allocates enough memory to exhaust the current WASM linear
   * memory, the runtime calls `memory.grow(n_pages)`. This **replaces the
   * underlying `ArrayBuffer`**. Any `TypedArray` or `DataView` built on the
   * old buffer becomes "detached" — all reads return `0`, all writes are
   * silently discarded.
   *
   * The risk in GWEN:
   *   - Rust-side: safe, Rust never holds a raw `ArrayBuffer` reference.
   *   - TypeScript-side: `SharedMemoryManager.checkSentinels()` and any
   *     debug-draw tool that builds a `Float32Array` view over `memory.buffer`
   *     **must** re-wrap `memory.buffer` on every frame, not cache it.
   *
   * This method returns the **live** `WebAssembly.Memory` object (not the
   * buffer). Callers must access `.buffer` fresh on each use:
   * ```typescript
   * const view = new Float32Array(bridge.getLinearMemory()!.buffer, ptr, 8);
   * //                                                      ^^^^^^^^^
   * //                                 always re-wrap — buffer may have changed
   * ```
   *
   * Returns `null` in Node.js test environments where the real WASM module
   * is replaced by a mock that does not export memory.
   */
  getLinearMemory(): WebAssembly.Memory | null;

  // ── Stats ────────────────────────────────────────────────────────────────

  /** Return a JSON string with engine runtime metrics (entity count, frame, etc.). */
  stats(): string;
}

/**
 * Guard that returns the active WasmEngine or throws a descriptive error.
 * All bridge methods call this so the error message is consistent and actionable.
 *
 * @throws {Error} If `initWasm()` has not been called yet.
 * @internal
 */
function requireWasm(): WasmEngine {
  if (!_wasmEngine) {
    throw new Error(
      '[GWEN] WASM core not initialized.\n' + 'Call `await initWasm()` before starting the Engine.',
    );
  }
  return _wasmEngine;
}

/**
 * Concrete implementation of `WasmBridge`.
 *
 * Every public method delegates to the `_wasmEngine` singleton via
 * `requireWasm()`, which throws a clear error if WASM is not yet loaded.
 * All type conversions (e.g. `number[] → Uint32Array`, packed EntityId
 * reconstruction) happen here so callers never touch raw Rust types.
 *
 * @internal — Obtain the singleton via `getWasmBridge()`.
 */
class WasmBridgeImpl implements WasmBridge {
  // ── Status ───────────────────────────────────────────────────────────────

  isActive(): boolean {
    return _wasmEngine !== null;
  }

  engine(): WasmEngine {
    return requireWasm();
  }

  // ── Entity ───────────────────────────────────────────────────────────────

  createEntity(): WasmEntityId {
    return requireWasm().create_entity();
  }

  deleteEntity(index: number, generation: number): boolean {
    return requireWasm().delete_entity(index, generation);
  }

  isAlive(index: number, generation: number): boolean {
    return requireWasm().is_alive(index, generation);
  }

  countEntities(): number {
    return requireWasm().count_entities();
  }

  // ── Component ────────────────────────────────────────────────────────────

  registerComponentType(): number {
    return requireWasm().register_component_type();
  }

  addComponent(index: number, generation: number, typeId: number, data: Uint8Array): boolean {
    return requireWasm().add_component(index, generation, typeId, data);
  }

  removeComponent(index: number, generation: number, typeId: number): boolean {
    return requireWasm().remove_component(index, generation, typeId);
  }

  hasComponent(index: number, generation: number, typeId: number): boolean {
    return requireWasm().has_component(index, generation, typeId);
  }

  getComponentRaw(index: number, generation: number, typeId: number): Uint8Array {
    return requireWasm().get_component_raw(index, generation, typeId);
  }

  // ── Query ────────────────────────────────────────────────────────────────

  updateEntityArchetype(index: number, typeIds: number[]): void {
    requireWasm().update_entity_archetype(index, new Uint32Array(typeIds));
  }

  removeEntityFromQuery(index: number): void {
    requireWasm().remove_entity_from_query(index);
  }

  /**
   * Convert raw Rust slot indices → packed TypeScript EntityIds.
   * Packing formula: `(generation << 20) | (index & 0xFFFFF)`.
   */
  queryEntities(typeIds: number[]): number[] {
    const indices = Array.from(requireWasm().query_entities(new Uint32Array(typeIds)));
    return indices.map((idx) => {
      const gen = requireWasm().get_entity_generation(idx);
      return (gen << 20) | (idx & 0xfffff);
    });
  }

  getEntityGeneration(index: number): number {
    return requireWasm().get_entity_generation(index);
  }

  // ── Game loop ────────────────────────────────────────────────────────────

  tick(deltaMs: number): void {
    requireWasm().tick(deltaMs);
  }

  // ── Shared memory ────────────────────────────────────────────────────────

  allocSharedBuffer(byteLength: number): number {
    return requireWasm().alloc_shared_buffer(byteLength);
  }

  syncTransformsToBuffer(ptr: number, maxEntities: number): void {
    requireWasm().sync_transforms_to_buffer(ptr, maxEntities);
  }

  syncTransformsFromBuffer(ptr: number, maxEntities: number): void {
    requireWasm().sync_transforms_from_buffer(ptr, maxEntities);
  }

  // ── Linear memory ────────────────────────────────────────────────────────

  /**
   * Return the live `WebAssembly.Memory` exported by gwen_core.wasm.
   *
   * wasm-bindgen exposes it as `glueModule.memory`. We cache the module
   * reference in `_wasmModule` at init time, so this is a single property
   * read — no cost on the hot path.
   *
   * Returns `null` when the WASM module is not yet loaded or when running
   * in a test environment that injects a mock without a real memory export.
   */
  getLinearMemory(): WebAssembly.Memory | null {
    return _wasmExports?.memory ?? null;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  stats(): string {
    return requireWasm().stats();
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

const _bridge = new WasmBridgeImpl();

/**
 * Return the `WasmBridge` singleton.
 *
 * The bridge is always available — it is created eagerly at module load time.
 * Methods will throw if `initWasm()` has not been called yet.
 *
 * @example
 * ```typescript
 * await initWasm();
 * const bridge = getWasmBridge();
 * bridge.isActive(); // true
 * ```
 */
export function getWasmBridge(): WasmBridge {
  return _bridge;
}

/**
 * Inject a mock `WasmEngine` — **reserved for unit tests only**.
 *
 * Allows the `Engine` to be tested without a real browser or `.wasm` binary.
 * `getLinearMemory()` returns `null` in this mode because `_wasmModule` is
 * left `null` intentionally — sentinel checks and debug views are silently
 * skipped, which is the correct behaviour in a Node.js test environment.
 *
 * @param mock - A `WasmEngine` mock (typically built with `vi.fn()`).
 */
export function _injectMockWasmEngine(mock: WasmEngine): void {
  _wasmEngine = mock;
  _initPromise = Promise.resolve();
}

/**
 * Fully reset the bridge state — **reserved for unit tests only**.
 *
 * Clears `_wasmEngine`, `_wasmModule`, `_wasmExports` and `_initPromise`
 * so that the next `initWasm()` call starts from a clean slate.
 * Call this in `afterEach` to prevent state leaking between tests.
 */
export function _resetWasmBridge(): void {
  _wasmEngine = null;
  _wasmModule = null;
  _wasmExports = null;
  _initPromise = null;
}
