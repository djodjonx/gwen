/**
 * @file Plugin Type Definitions
 *
 * Core plugin interfaces — TsPlugin, GwenWasmPlugin.
 * Depends only on core.ts (no circular dependencies).
 *
 * @internal Do not export directly; use types.ts barrel export
 */

/**
 * TypeScript Plugin interface — lifecycle hooks for extending engine behavior.
 *
 * Plugins participate in the game loop:
 * 1. **onInit** — called once during registration
 * 2. **onBeforeUpdate** — input capture phase (every frame)
 * 3. **onUpdate** — game logic phase (every frame, after WASM)
 * 4. **onRender** — rendering phase (every frame)
 * 5. **onDestroy** — cleanup phase
 *
 * @example
 * ```typescript
 * const MyPlugin: TsPlugin = {
 *   name: 'MyPlugin',
 *   onInit(api) {
 *     console.log('Initialized');
 *   },
 *   onUpdate(api, dt) {
 *     console.log('Update:', dt);
 *   }
 * };
 * ```
 */
export interface TsPlugin {
  /** Unique plugin name */
  readonly name: string;

  /**
   * Called once when plugin is registered.
   * Use for initialization: setup services, register hooks, create entities.
   *
   * @param api - Engine API instance
   */
  onInit?(api: any): void; // EngineAPI

  /**
   * Called at start of each frame — input capture phase.
   * Use for reading inputs, computing intentions.
   *
   * @param api - Engine API instance
   * @param deltaTime - Frame delta in seconds
   */
  onBeforeUpdate?(api: any, deltaTime: number): void; // EngineAPI

  /**
   * Called after WASM update — game logic phase.
   * Use for updating game state based on inputs and physics results.
   *
   * @param api - Engine API instance
   * @param deltaTime - Frame delta in seconds
   */
  onUpdate?(api: any, deltaTime: number): void; // EngineAPI

  /**
   * Called at end of frame — rendering phase.
   * Use for drawing, UI updates.
   *
   * @param api - Engine API instance
   */
  onRender?(api: any): void; // EngineAPI

  /**
   * Called when plugin is unregistered or engine stops.
   * Use for cleanup: remove event listeners, free resources.
   */
  onDestroy?(): void;
}

/**
 * WASM Plugin interface — lifecycle for Rust plugins.
 *
 * WASM plugins run the Rust simulation (physics, AI, etc).
 * They communicate with TypeScript via:
 * - Shared memory region (optional, legacy)
 * - Plugin Data Bus (recommended)
 *
 * @typeParam P - Service map type (services exposed by this plugin)
 *
 * @internal
 */
export interface GwenWasmPlugin<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique plugin identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Semantic version */
  readonly version?: string;

  /**
   * Bytes to allocate in shared buffer.
   * Set to 0 when using Plugin Data Bus (recommended).
   */
  readonly sharedMemoryBytes: number;

  /**
   * Data channels declared by this plugin.
   * Plugin Data Bus allocates buffers before onInit.
   */
  readonly channels?: any[]; // PluginChannel[]

  /**
   * Services exposed by this plugin.
   * Keys become service names in api.services.
   */
  readonly provides?: P;

  /**
   * Optional pre-fetch — called before onInit for early resource loading.
   * Use for fetching .wasm binaries in parallel.
   */
  _prefetch?(): Promise<void>;

  /**
   * Initialize WASM plugin — load .wasm, setup buffers, register services.
   * Called once before engine.start().
   *
   * @param bridge - WASM bridge instance
   * @param region - Pre-allocated shared memory region (or null)
   * @param api - Engine API instance
   * @param bus - Plugin Data Bus instance
   */
  onInit(bridge: any, region: any, api: any, bus?: any): Promise<void>;

  /**
   * Called each frame at WasmStep slot — BEFORE onUpdate.
   * Run Rust simulation here.
   *
   * @param deltaTime - Delta time in milliseconds
   */
  onStep?(deltaTime: number): void;

  /**
   * Called when WASM linear memory grows.
   * Recreate typed array views on new buffer.
   *
   * @param newMemory - New WebAssembly.Memory instance
   */
  onMemoryGrow?(newMemory: WebAssembly.Memory): void;

  /**
   * Called when engine stops — cleanup WASM resources.
   */
  onDestroy?(): void;
}
