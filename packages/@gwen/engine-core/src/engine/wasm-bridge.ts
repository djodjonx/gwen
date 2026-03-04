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
  // Entity
  create_entity(): WasmEntityId;
  delete_entity(index: number, generation: number): boolean;
  is_alive(index: number, generation: number): boolean;
  count_entities(): number;

  // Component
  register_component_type(): number;
  add_component(index: number, generation: number, typeId: number, data: Uint8Array): boolean;
  remove_component(index: number, generation: number, typeId: number): boolean;
  has_component(index: number, generation: number, typeId: number): boolean;
  get_component_raw(index: number, generation: number, typeId: number): Uint8Array;

  // Query
  update_entity_archetype(index: number, typeIds: Uint32Array): void;
  remove_entity_from_query(index: number): void;
  query_entities(typeIds: Uint32Array): Uint32Array;
  get_entity_generation(index: number): number;

  // GameLoop
  tick(deltaMs: number): void;
  frame_count(): bigint;
  delta_time(): number;
  total_time(): number;

  // Shared Memory (WASM Plugin Bridge)
  alloc_shared_buffer(byteLength: number): number;
  sync_transforms_to_buffer(ptr: number, maxEntities: number): void;
  sync_transforms_from_buffer(ptr: number, maxEntities: number): void;

  // Stats
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

/**
 * Charge un module ES via un <script type="module"> injecté dans le DOM.
 * Contourne la restriction Vite sur import() des fichiers /public.
 */
/**
 * Extended Window interface for GWEN WASM module loading.
 * Allows dynamic property access for WASM glue code caching.
 */
interface GwenWindow extends Window {
  [key: string]: unknown;
}

declare const window: GwenWindow;

/**
 * WASM Glue Module interface (from wasm-bindgen output).
 * Describes the shape of the loaded WASM JS glue file.
 */
interface WasmGlueModule {
  default?: (init: { module_or_path?: Response | undefined }) => Promise<void>;
  initSync?: (init: { module: ArrayBuffer }) => void;
  Engine?: new (maxEntities: number) => WasmEngine;
  [key: string]: unknown;
}

async function loadWasmGlue(jsUrl: string): Promise<WasmGlueModule> {
  if (typeof document === 'undefined') {
    throw new Error('[GWEN] initWasm() requiert un environnement navigateur (pas de DOM détecté).');
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

/**
 * WASM bridge interface. All methods throw an error if
 * `initWasm()` was not called first.
 */
export interface WasmBridge {
  /** True if Rust/WASM core is initialized and ready. */
  isActive(): boolean;

  /** Direct access to Rust WasmEngine. Throws if not initialized. */
  engine(): WasmEngine;

  // ── Entity ──
  createEntity(): WasmEntityId;
  deleteEntity(index: number, generation: number): boolean;
  isAlive(index: number, generation: number): boolean;
  countEntities(): number;

  // ── Component ──
  registerComponentType(): number;
  addComponent(index: number, generation: number, typeId: number, data: Uint8Array): boolean;
  removeComponent(index: number, generation: number, typeId: number): boolean;
  hasComponent(index: number, generation: number, typeId: number): boolean;
  getComponentRaw(index: number, generation: number, typeId: number): Uint8Array;

  // ── Query ──
  updateEntityArchetype(index: number, typeIds: number[]): void;
  removeEntityFromQuery(index: number): void;
  queryEntities(typeIds: number[]): number[];
  getEntityGeneration(index: number): number;

  // ── GameLoop ──
  tick(deltaMs: number): void;

  // ── Shared Memory (WASM Plugin Bridge) ──
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

  // ── Stats ──
  stats(): string;
}

function requireWasm(): WasmEngine {
  if (!_wasmEngine) {
    throw new Error(
      '[GWEN] WASM core not initialized.\n' + 'Call `await initWasm()` before starting the Engine.',
    );
  }
  return _wasmEngine;
}

class WasmBridgeImpl implements WasmBridge {
  isActive(): boolean {
    return _wasmEngine !== null;
  }

  engine(): WasmEngine {
    return requireWasm();
  }

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

  updateEntityArchetype(index: number, typeIds: number[]): void {
    requireWasm().update_entity_archetype(index, new Uint32Array(typeIds));
  }

  removeEntityFromQuery(index: number): void {
    requireWasm().remove_entity_from_query(index);
  }

  queryEntities(typeIds: number[]): number[] {
    const indices = Array.from(requireWasm().query_entities(new Uint32Array(typeIds)));
    // Reconstruct packed EntityIds: (generation << 20) | index
    return indices.map((idx) => {
      const gen = requireWasm().get_entity_generation(idx);
      return (gen << 20) | (idx & 0xfffff);
    });
  }

  getEntityGeneration(index: number): number {
    return requireWasm().get_entity_generation(index);
  }

  tick(deltaMs: number): void {
    requireWasm().tick(deltaMs);
  }

  allocSharedBuffer(byteLength: number): number {
    return requireWasm().alloc_shared_buffer(byteLength);
  }

  syncTransformsToBuffer(ptr: number, maxEntities: number): void {
    requireWasm().sync_transforms_to_buffer(ptr, maxEntities);
  }

  syncTransformsFromBuffer(ptr: number, maxEntities: number): void {
    requireWasm().sync_transforms_from_buffer(ptr, maxEntities);
  }

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
    // memory lives on the raw WASM instance exports (_wasmExports),
    // not on the ES module glue (_wasmModule).
    return _wasmExports?.memory ?? null;
  }

  stats(): string {
    return requireWasm().stats();
  }
}

// Singleton
const _bridge = new WasmBridgeImpl();

/** Returns the WasmBridge singleton. */
export function getWasmBridge(): WasmBridge {
  return _bridge;
}

/**
 * Injects a mock WasmEngine directly — reserved for unit tests.
 * Allows testing the Engine without a real browser or WASM binary.
 * `getLinearMemory()` returns `null` in this mode — sentinel checks
 * and debug views are silently skipped, which is the correct behaviour
 * for a Node.js test environment.
 */
export function _injectMockWasmEngine(mock: WasmEngine): void {
  _wasmEngine = mock;
  // _wasmModule intentionally left null so getLinearMemory() returns null
  _initPromise = Promise.resolve();
}

/** Complete reset — reserved for unit tests. */
export function _resetWasmBridge(): void {
  _wasmEngine = null;
  _wasmModule = null;
  _wasmExports = null;
  _initPromise = null;
}
