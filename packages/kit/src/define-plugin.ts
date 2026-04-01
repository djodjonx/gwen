/**
 * @file definePlugin — factory API for GWEN plugins.
 *
 * New architecture (single API):
 * `definePlugin((options?) => ({ ...definitionAndHooks }))`
 */

import type {
  GwenPlugin,
  GwenPluginWasmContext,
  EngineAPI,
  PluginChannel,
  WasmBridge,
  MemoryRegion,
  PluginDataBus,
  GwenHooks,
} from '@gwenengine/core';
import type { GwenPluginMeta } from '@gwenengine/core';

// ── Lifecycle shapes ──────────────────────────────────────────────────────────

/**
 * Hooks de cycle de vie pour un plugin TypeScript.
 *
 * @typeParam M - Map des services disponibles via `api.services`.
 * @typeParam H - Map des hooks disponibles via `api.hooks`.
 */
export interface GwenPluginLifecycle<M extends object = object, H extends object = object> {
  /** Appelé une fois lors de l'enregistrement du plugin. */
  onInit?(api: EngineAPI<M, H>): void;
  /** Appelé en début de frame, avant la phase WASM. */
  onBeforeUpdate?(api: EngineAPI<M, H>, deltaTime: number): void;
  /** Appelé après la phase WASM pour la logique de jeu. */
  onUpdate?(api: EngineAPI<M, H>, deltaTime: number): void;
  /** Appelé en fin de frame (rendu/UI). */
  onRender?(api: EngineAPI<M, H>): void;
  /** Appelé au démontage du plugin / arrêt moteur. */
  onDestroy?(): void;
}

/**
 * Hooks de cycle de vie pour un plugin WASM.
 *
 * Étend `GwenPluginLifecycle` avec la phase d'initialisation WASM et le step.
 */
export interface WasmPluginLifecycle<
  M extends object = object,
  H extends object = object,
> extends GwenPluginLifecycle<M, H> {
  /** Préchargement optionnel, exécuté en parallèle des autres plugins WASM. */
  prefetch?(): Promise<void>;
  /** Initialisation WASM (instanciation module, bus, enregistrement services). */
  onWasmInit(
    bridge: WasmBridge,
    region: MemoryRegion | null,
    api: EngineAPI<M, H>,
    bus: PluginDataBus,
  ): Promise<void>;
  /** Step de simulation WASM appelé avant `onUpdate`. */
  onStep?(deltaTime: number): void;
  /** Callback optionnel déclenché lors d'un `memory.grow()`. */
  onMemoryGrow?(newMemory: WebAssembly.Memory): void;
}

// ── Definition shapes (factory return value) ─────────────────────────────────

/**
 * Champs communs aux plugins TS et WASM.
 */
interface BasePluginDefinition<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
> {
  /** Nom unique du plugin. */
  name: N;
  /** Services déclarés par le plugin (phantom types). */
  provides?: P;
  /** Hooks custom émis par le plugin (phantom types). */
  providesHooks?: H;
  /** Extensions de schéma consommées par `gwen prepare`. */
  extensions?: {
    prefab?: unknown;
    scene?: unknown;
    ui?: unknown;
  };
  /** Version sémantique optionnelle (debug/overlay). */
  version?: string;
  /** Métadonnées CLI (type references, services, hooks). */
  meta?: GwenPluginMeta;
}

/** Définition d'un plugin TS (sans champ `wasm`). */
export type GwenPluginDefinition<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
> = BasePluginDefinition<N, P, H> & GwenPluginLifecycle<P, H & GwenHooks> & { wasm?: never };

/** Contexte statique WASM déclaré au niveau plugin. */
export interface WasmPluginStaticContext {
  /** Identifiant unique du plugin WASM. */
  readonly id: string;
  /** Opt-in explicite SharedArrayBuffer. */
  readonly sharedMemory?: boolean;
  /** Taille mémoire partagée legacy (0 pour Data Bus only). */
  readonly sharedMemoryBytes?: number;
  /** Déclaration des channels du Plugin Data Bus. */
  readonly channels?: PluginChannel[];
}

/** Définition d'un plugin WASM. */
export type WasmPluginDefinition<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
> = BasePluginDefinition<N, P, H> &
  WasmPluginLifecycle<P, H & GwenHooks> & {
    wasm: WasmPluginStaticContext;
  };

export type AnyPluginDefinition =
  | GwenPluginDefinition<string, Record<string, unknown>, Record<string, any>>
  | WasmPluginDefinition<string, Record<string, unknown>, Record<string, any>>;

// ── Returned constructor type ─────────────────────────────────────────────────

/**
 * Instance concrète produite par `definePlugin`.
 *
 * Les hooks sont toujours présents côté type, même si non implémentés
 * (no-op au runtime), ce qui simplifie l'appel côté moteur/tests.
 */
export type ConcretePlugin<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
> = GwenPlugin<N, P, H> & {
  onInit(api: EngineAPI<P, H>): void;
  onBeforeUpdate(api: EngineAPI<P, H>, deltaTime: number): void;
  onUpdate(api: EngineAPI<P, H>, deltaTime: number): void;
  onRender(api: EngineAPI<P, H>): void;
  onDestroy(): void;
};

/**
 * Classe plugin retournée par `definePlugin`.
 *
 * - sans options: `new Plugin()`
 * - avec options: `new Plugin(options?)`
 */
export type PluginClass<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
  Options,
> = Options extends void
  ? { new (): ConcretePlugin<N, P, H> }
  : { new (options?: Options): ConcretePlugin<N, P, H> };

/** Alias utilitaire pour typer une instance de plugin. */
export type GwenPluginInstance<T extends abstract new (...args: any[]) => any> = InstanceType<T>;

type InferPluginProvides<D> = D extends { provides?: infer P }
  ? P extends Record<string, unknown>
    ? P
    : Record<string, never>
  : Record<string, never>;

type InferPluginHooks<D> = D extends { providesHooks?: infer H }
  ? H extends Record<string, any>
    ? H
    : Record<string, never>
  : Record<string, never>;

type InferPluginName<D> = D extends { name: infer N extends string } ? N : string;

type InferFactoryOptions<F extends (...args: any[]) => any> =
  Parameters<F> extends [] ? void : Exclude<Parameters<F>[0], undefined>;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Déclare un plugin TS via une factory.
 *
 * La factory est exécutée à chaque `new Plugin(...)` et doit retourner
 * un objet contenant les métadonnées (`name`, `provides`, ...) et les hooks.
 */
export function definePlugin<
  F extends (
    options?: any,
  ) => GwenPluginDefinition<string, Record<string, unknown>, Record<string, any>>,
>(
  factory: F,
): PluginClass<
  InferPluginName<ReturnType<F>>,
  InferPluginProvides<ReturnType<F>>,
  InferPluginHooks<ReturnType<F>>,
  InferFactoryOptions<F>
>;

/**
 * Déclare un plugin WASM via une factory.
 *
 * Même contrat que la version TS, avec `wasm` + `onWasmInit`.
 */
export function definePlugin<
  F extends (
    options?: any,
  ) => WasmPluginDefinition<string, Record<string, unknown>, Record<string, any>>,
>(
  factory: F,
): PluginClass<
  InferPluginName<ReturnType<F>>,
  InferPluginProvides<ReturnType<F>>,
  InferPluginHooks<ReturnType<F>>,
  InferFactoryOptions<F>
>;

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Implémentation runtime de `definePlugin`.
 *
 * Construit une classe compatible `GwenPlugin` à partir de la définition
 * retournée par la factory et câble le contexte `wasm` quand présent.
 */
export function definePlugin<F extends (options?: any) => AnyPluginDefinition>(
  factory: F,
): PluginClass<
  InferPluginName<ReturnType<F>>,
  InferPluginProvides<ReturnType<F>>,
  InferPluginHooks<ReturnType<F>>,
  InferFactoryOptions<F>
> {
  type D = ReturnType<F>;
  type N = InferPluginName<D>;
  type P = InferPluginProvides<D>;
  type H = InferPluginHooks<D>;
  type Options = InferFactoryOptions<F>;

  class PluginInstance implements GwenPlugin<N, P, H> {
    readonly name: N;
    readonly version?: string;
    readonly meta?: import('@gwenengine/core').GwenPluginMeta;
    readonly provides?: P;
    readonly providesHooks?: H;
    readonly wasm?: GwenPluginWasmContext;

    private readonly _impl: D;

    constructor(options?: Options) {
      const definition = factory(options as Options) as D;
      const isWasm = 'wasm' in definition && definition.wasm !== undefined;

      this.name = definition.name as N;
      if (definition.version !== undefined) this.version = definition.version;
      if (definition.meta !== undefined) this.meta = definition.meta;
      if (definition.provides !== undefined) this.provides = definition.provides as P;
      if (definition.providesHooks !== undefined)
        this.providesHooks = definition.providesHooks as H;
      this._impl = definition;

      if (isWasm) {
        const wasmDef = definition as WasmPluginDefinition<
          string,
          Record<string, unknown>,
          Record<string, any>
        >;
        const wasmCtx = {
          id: wasmDef.wasm.id,
          sharedMemory: wasmDef.wasm.sharedMemory,
          sharedMemoryBytes: wasmDef.wasm.sharedMemoryBytes,
          channels: wasmDef.wasm.channels,
          prefetch: wasmDef.prefetch?.bind(wasmDef),
          onInit: wasmDef.onWasmInit.bind(wasmDef) as any,
          onStep: wasmDef.onStep?.bind(wasmDef),
          onMemoryGrow: wasmDef.onMemoryGrow?.bind(wasmDef),
        };
        this.wasm = wasmCtx as unknown as GwenPluginWasmContext;
      }
    }

    onInit(api: EngineAPI): void {
      this._impl.onInit?.(api as EngineAPI<any, any>);
    }

    onBeforeUpdate(api: EngineAPI, deltaTime: number): void {
      this._impl.onBeforeUpdate?.(api as EngineAPI<any, any>, deltaTime);
    }

    onUpdate(api: EngineAPI, deltaTime: number): void {
      this._impl.onUpdate?.(api as EngineAPI<any, any>, deltaTime);
    }

    onRender(api: EngineAPI): void {
      this._impl.onRender?.(api as EngineAPI<any, any>);
    }

    onDestroy(): void {
      this._impl.onDestroy?.();
    }
  }

  return PluginInstance as unknown as PluginClass<N, P, H, Options>;
}
