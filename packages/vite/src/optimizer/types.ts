/**
 * Metadata for a single component field as stored in the WASM memory layout.
 */
export interface ComponentFieldMeta {
  readonly name: string;
  readonly type: string;
  readonly byteOffset: number;
}

/**
 * Build-time descriptor for a `defineComponent()` call.
 * Populated by the AST walker when it encounters a component definition.
 */
export interface ComponentEntry {
  /** Component name (matches `defineComponent({ name: '...' })`) */
  readonly name: string;
  /** Unique numeric ID (`_typeId` from defineComponent) */
  readonly typeId: number;
  /** Total byte size of one instance in WASM linear memory */
  readonly byteSize: number;
  /** `byteSize / 4` — Float32 slots per entity */
  readonly f32Stride: number;
  /** Ordered field descriptors */
  readonly fields: ReadonlyArray<ComponentFieldMeta>;
  /** Absolute or relative import path to the file that declares this component */
  readonly importPath: string;
  /** The exported identifier name for this component */
  readonly exportName: string;
}

/**
 * A detected optimizable pattern — a `useQuery + onUpdate` block where
 * the optimizer can replace per-entity get/set calls with bulk WASM calls.
 */
export interface OptimizablePattern {
  /** Components queried by `useQuery([...])` */
  readonly queryComponents: string[];
  /** Which components are read inside the `onUpdate` body */
  readonly readComponents: string[];
  /** Which components are written inside the `onUpdate` body */
  readonly writeComponents: string[];
  /** Source location for error reporting and source map generation. */
  readonly loc: { line: number; column: number; file: string };
}

/**
 * Tier of WASM APIs available based on the user's installed packages.
 * Determines which bulk operations can be generated.
 */
export type WasmTier = 'core' | 'physics2d' | 'physics3d';

/**
 * Context passed to the code generator.
 */
export interface OptimizerContext {
  /** Component registry collected during buildStart */
  readonly manifest: import('./component-manifest').ComponentManifest;
  /** Which WASM tier is active */
  readonly tier: WasmTier;
  /** Enable verbose logging (set via `gwenOptimizerPlugin({ debug: true })`) */
  readonly debug: boolean;
}
