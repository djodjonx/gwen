# 🏗️ Architecture du Framework GWEN — Moteur de Jeu Hybride WASM/TS

> **Version :** 1.1 — Document fondateur définitif
> **Date :** 3 mars 2026
> **Statut :** ✅ Architecture validée et gravée dans le marbre

> **Canonical execution contract:** [`specs/rfc-v3/IMPLEMENTATION_PLAYBOOK_V2.md`](specs/rfc-v3/IMPLEMENTATION_PLAYBOOK_V2.md) is the authoritative source for frozen architecture decisions, ordered PR backlog, and implementation gates. This document provides the architectural overview; the playbook governs execution.

---

## 1. Vision et Philosophie

L'objectif de GWEN est de fournir un moteur de jeu web 2D/3D qui offre les **performances brutes du bas niveau (Rust)** tout en conservant **l'ergonomie et la Developer Experience (DX) des frameworks web modernes**.

L'architecture repose sur une séparation stricte des responsabilités :

- **Le Muscle (Rust/WASM) :** Gère la mémoire linéaire, l'ECS, les mathématiques, la physique, l'IA. Le développeur de *jeu* n'écrit jamais de Rust — c'est transparent.
- **Le Cerveau & Le Visage (TypeScript & DOM) :** Gère la logique métier, les entrées utilisateurs, le rendu, l'orchestration et l'interface (HUD).

**Principe fondateur :** le développeur écrit son jeu en TypeScript. Le moteur délègue silencieusement les opérations intensives au cœur Rust/WASM — transparent, sans lock-in.

**Rust n'est jamais requis côté utilisateur.** Les artefacts `.wasm` sont pré-compilés et publiés dans chaque package npm. Seuls les contributeurs du framework compilent du Rust.

---

## 2. Fondations Technologiques

1. **Rust/WASM** : Performances natives dans le navigateur. Compilé via `wasm-pack` en CI. L'artefact `gwen_core_bg.wasm` est pré-compilé et embarqué dans `@djodjonx/gwen-engine-core/wasm/`.
2. **ECS (Entity Component System)** : Les données ne sont pas des objets POO mais des tableaux plats (`ComponentStorage` SoA). Zéro copie, zéro GC, vitesse maximale.
3. **WASM indépendants + SharedArrayBuffer** : `gwen-core` et les plugins WASM sont des `.wasm` **séparés**, communiquant via un buffer mémoire partagé. Zéro copie, zéro marshalling, deux modules déployables indépendamment.
4. **Plugin TS comme colle** : Le plugin TypeScript d'un plugin WASM n'est pas un "wrapper qui translate" — il initialise la mémoire partagée et orchestre les appels entre les modules WASM. La logique de simulation reste 100% en Rust.

---

## 3. Modèle de Plugin WASM — La Décision Clé

### Pourquoi pas un build monolithique ?

Compiler `gwen-core + physics2d` en **un seul `.wasm`** est techniquement possible (build-time linking) mais a un coût majeur : **l'utilisateur devrait avoir Rust installé** pour rebuilder dès qu'il déclare un plugin dans sa config. C'est contraire au principe fondateur de GWEN.

### Le modèle retenu : deux `.wasm` + SharedArrayBuffer

```
@djodjonx/gwen-engine-core/wasm/
  gwen_core_bg.wasm        ← ECS, Transform, GameLoop

@djodjonx/gwen-plugin-physics2d/wasm/
  gwen_physics2d_bg.wasm   ← Rapier2D, RigidBody, Collider
```

Les deux modules partagent la **même mémoire linéaire** via `SharedArrayBuffer`. Le plugin TypeScript (`@djodjonx/gwen-plugin-physics2d`) agit comme **colle d'initialisation** : il monte la mémoire partagée, câble les imports/exports WASM, et expose une API propre au `WasmBridge`.

```
┌──────────────────────────────────────────────────────────┐
│                   TypeScript (Engine)                    │
│  WasmBridge.physics_step(delta)   ← API haut niveau      │
└────────────┬────────────────────────────┬────────────────┘
             │                            │
    ┌────────▼────────┐        ┌──────────▼────────┐
    │  gwen_core.wasm │        │  physics2d.wasm    │
    │  ECS / GameLoop │        │  Rapier2D          │
    │                 │        │                    │
    │  ComponentStorage◄───────► RigidBodySet       │
    │  (positions,    │        │  (simulation)      │
    │   velocités)    │        │                    │
    └────────┬────────┘        └────────────────────┘
             │
     SharedArrayBuffer
     (mémoire partagée — zéro copie)
```

### Overhead réel

| Approche | Overhead par frame (1000 entités) | Rust requis utilisateur |
|----------|-----------------------------------|-------------------------|
| Build monolithique | ~0 ms | ✅ **OUI** — bloquant |
| Deux WASM + copie JS | ~10 ms | ❌ Non — mais **trop lent** |
| **Deux WASM + SharedArrayBuffer** | **~0.01 ms** | ❌ **Non — retenu** |

La synchronisation avec `SharedArrayBuffer` est négligeable (< 0.1% du budget frame à 60 FPS).

---

## 4. Le Pipeline de Configuration

Point d'entrée du projet utilisateur — le **Composition Root**.

```typescript
// gwen.config.ts (Projet Utilisateur)
import { defineConfig } from '@djodjonx/gwen-cli';
import { physics2D } from '@djodjonx/gwen-plugin-physics2d'; // npm install@djodjonx/gwen-plugin-physics2d
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';

export default defineConfig({
  core: {
    maxEntities: 10_000,
    targetFPS: 60,
    // loop: 'internal'  ← default: engine owns RAF
    // loop: 'external'  ← JS calls engine.advance(delta) each frame; delta capped at maxDeltaSeconds (default 0.1)
  },

  // Plugins WASM — artefacts pré-compilés dans le package npm.
  // Aucune installation de Rust. Le CLI charge le .wasm au démarrage.
  wasm: [
    physics2D({ gravity: 9.81, friction: 0.9 })
  ],

  // Plugins TypeScript — logique, DOM, Web APIs
  plugins: [
    new InputPlugin(),
    new Canvas2DRenderer({ width: 800, height: 600 }),
  ]
});
```

---

## 5. Anatomie d'un Plugin WASM

Un plugin WASM GWEN est composé de **deux parties distinctes** :

### A. Le crate Rust (`crates/gwen-plugin-physics2d/`)

Compilé **une seule fois en CI**, artefact publié dans le package npm. L'utilisateur ne voit jamais ce code.

```rust
// crates/gwen-plugin-physics2d/src/lib.rs
use wasm_bindgen::prelude::*;
use rapier2d::prelude::*;

#[wasm_bindgen]
pub struct Physics2DPlugin {
    pipeline: PhysicsPipeline,
    rigid_body_set: RigidBodySet,
    // ...
    /// Pointeur vers la mémoire partagée avec gwen-core (SharedArrayBuffer)
    shared_memory: *mut f32,
}

#[wasm_bindgen]
impl Physics2DPlugin {
    #[wasm_bindgen(constructor)]
    pub fn new(gravity: f32, shared_ptr: *mut f32) -> Self { ... }

    /// Avance la simulation. Lit/écrit directement dans shared_memory.
    /// Appelé par le WasmBridge TypeScript à chaque frame.
    pub fn step(&mut self, delta: f32) { ... }

    /// Retourne les événements de collision (JSON léger).
    pub fn get_collision_events(&self) -> String { ... }
}
```

### B. Le package TypeScript (`packages/@djodjonx/gwen-plugin-physics2d/`)

C'est la **colle** — initialise la mémoire partagée, charge le `.wasm`, enregistre les méthodes dans le `WasmBridge`. Contient **zéro logique de simulation**.

```typescript
// packages/@djodjonx/gwen-plugin-physics2d/src/index.ts
import { GwenWasmPlugin, WasmBridge } from '@djodjonx/gwen-engine-core';

export class Physics2DPlugin implements GwenWasmPlugin {
  readonly name = 'Physics2D';

  async onInit(bridge: WasmBridge, sharedBuffer: SharedArrayBuffer) {
    // Charge le .wasm pré-compilé depuis le package — zéro Rust requis
    const wasm = await import('../wasm/gwen_physics2d.js');
    await wasm.default();

    // Monte la mémoire partagée avec gwen-core
    const sharedPtr = bridge.getSharedMemoryPtr();
    this.physics = new wasm.Physics2DPlugin(this.options.gravity, sharedPtr);
  }

  onStep(delta: number) {
    this.physics.step(delta); // < 0.5ms, tout en Rust
  }

  getCollisionEvents(): CollisionEvent[] {
    return JSON.parse(this.physics.get_collision_events());
  }
}

// Helper de config (objet descripteur pur)
export const physics2D = (options = { gravity: 9.81 }) =>
  new Physics2DPlugin(options);
```

---

## 6. L'Architecture des Plugins TypeScript

Les plugins TS purs implémentent `GwenPlugin` et utilisent le **Query System** via `EngineAPI` :

```typescript
// src/systems/PlayerController.ts
import { GwenPlugin, EngineAPI } from '@djodjonx/gwen-engine-core';

export class PlayerController implements GwenPlugin {
  readonly name = 'PlayerController';

  constructor(private audio: IAudioService) {} // Pure DI par constructeur

  onUpdate(api: EngineAPI, deltaTime: number) {
    const players = api.query([PlayerInput, Velocity]);
    for (const id of players) {
      const input = api.component.get(id, PlayerInput);
      if (input.isJumping) {
        api.component.set(id, Velocity, { y: -500 }); // Écriture → mémoire WASM
        this.audio.playSound('jump.mp3');
      }
    }
  }
}
```

---

## 7. Séquençage de la Boucle de Jeu (60 FPS)

Two loop modes are supported. See [External Loop Contract](specs/rfc-v3/IMPLEMENTATION_PLAYBOOK_V2.md#3-final-runtime-contract-external-loop) for the authoritative specification.

### Mode `loop: 'internal'` (default)
The engine owns `requestAnimationFrame`. Delta is computed internally and capped at `maxDeltaSeconds` (default `0.1`).

```
RAF(now) → calcul ΔT (capped) → onBeforeUpdate → engine.advance(ΔT) → onUpdate → onRender
```

### Mode `loop: 'external'`
JS controls timing. The engine never starts RAF. The caller must invoke `engine.advance(delta)` each frame.

```
JS tick → engine.advance(delta) → [onBeforeUpdate → Core reset channels → Rust step → onUpdate → onRender]
```

Frame sequence detail:
```
1. onBeforeUpdate  → TsPlugins : capture inputs, intentions           ~0.1ms
2. Core            → reset event channels (Data Bus protocol)         ~0.001ms
3. Rust/core step  → physics.step(), ai.step() (SharedMem)            ~0.5ms
4. onUpdate        → TsPlugins : logique métier post-step             ~1ms
5. onRender        → TsPlugins : dessin Canvas/WebGL                  ~5ms
                                                         Total : ~7ms (60 FPS ✅)
```

**Règle d'or :** le WASM est **authoritative** sur ses données. Après le Rust step, les positions physiques Rust écrasent tout. Ne jamais écrire depuis TypeScript un composant piloté par la physique Rust.

---

## 8. Pont TypeScript ↔ Rust (WasmBridge)

```
Engine.createEntity()     → WasmBridge → Rust EntityAllocator
Engine.addComponent()     → DataView/SchemaLayout → WasmBridge → Rust ComponentStorage
Engine.query()            → WasmBridge → Rust QuerySystem (cache archétype)
Engine.tick(delta)        → WasmBridge → Rust GameLoop
Engine.physics_step()     → Physics2DPlugin.onStep() → Rust Rapier2D (SharedArrayBuffer)
```

**EntityId 64-bit** : `(BigInt(generation) << 32n) | BigInt(index)` — 32 bits index + 32 bits génération, format `bigint` aligné Rust/TS, zéro conversion. Utiliser `createEntityId(index, generation)` / `unpackEntityId(id)` depuis `@djodjonx/gwen-engine-core`.

**Sérialisation binaire** : `computeSchemaLayout()` génère `serialize`/`deserialize` compilés depuis `defineComponent()`. Scratchpad global 1 KB — zéro allocation par frame.

---

## 9. Gestion des Données : Composants DSL

```typescript
// src/components/Velocity.comp.ts
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

export const Velocity = defineComponent({
  name: 'Velocity',
  schema: { x: Types.f32, y: Types.f32 }
});
```

**Types disponibles :** `f32, f64, i32, i64, u32, u64, bool, string`, **`vec2, vec3, vec4, quat, color`** (primitives spatiales et de couleur — présentes dans core, ne pas redéfinir dans les plugins)

---

## 10. Interface Utilisateur (HUD)

Direct Binding DOM, sans Virtual DOM — zéro micro-saccades :

```typescript
// src/ui/HealthBar.ui.ts
export const HealthBar = defineUI({
  name: 'HealthBar',
  onMount(api, entityId) {
    api.services.get('htmlUI').mount(entityId, `<div class="fill"></div>`);
  },
  render(api, entityId) {
    const hp = api.components.Health.getCurrent(entityId);
    api.services.get('htmlUI').style(entityId, 'fill', 'width', `${hp}%`);
  }
});
```

---

## 11. Injection de Dépendances & Service Locator

**Pure DI (constructeur) :** services instanciés dans `gwen.config.ts`, passés aux plugins.

**Service Locator (`api.services`) :** `register` dans `onInit` uniquement, `get` dans `onUpdate`.

```typescript
// Typage inféré automatiquement depuis la config — zéro cast manuel
api.services.get('keyboard')  // → KeyboardInput ✅
api.services.get('renderer')  // → Canvas2DRenderer ✅
api.services.get('physics')   // → Physics2DAPI ✅ (si wasm: [physics2D()])
```

---

## 12. Prefabs et Scènes

```typescript
// Prefab : recette déclarative d'entité
export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  components: [Transform, Velocity, AI, Sprite],
  defaults: { Velocity: { x: 0, y: 50 } }
});

// Scène : cycle de vie global, nettoie la mémoire WASM au changement
export const GameScene = defineScene('Game', (scenes) => ({
  ui: [BackgroundUI, PlayerUI, ScoreUI],
  plugins: [MovementSystem, PlayerSystem, CollisionSystem],
  onEnter(api) { api.prefabs.instantiate('Enemy', { x: 100, y: 0 }); },
  onExit(api)  { /* cleanup */ },
}));
```

---

## 13. Topologie du Monorepo

```
gwen/
├── Cargo.toml                          ← workspace Rust
├── pnpm-workspace.yaml                 ← workspace pnpm
│
├── crates/
│   ├── gwen-core/                      ← ECS + GameLoop + Transform (~150 KB WASM)
│   │   └── src/
│   │       ├── entity.rs               ← EntityAllocator avec générations
│   │       ├── component.rs            ← ComponentStorage SoA
│   │       ├── query.rs                ← QuerySystem cache archétype
│   │       ├── allocator.rs            ← allocateur bas niveau
│   │       ├── events.rs               ← EventBus pub/sub
│   │       ├── gameloop.rs             ← orchestration de frame
│   │       ├── transform.rs            ← Transform 2D
│   │       ├── transform_math.rs       ← maths vectorielles
│   │       └── bindings.rs             ← exports wasm-bindgen
│   │
│   └── gwen-plugin-physics2d/          ← 🔜 Crate Rust indépendant (Rapier2D)
│       ├── Cargo.toml                  ← dépend de rapier2d, PAS de gwen-core
│       └── src/
│           ├── lib.rs                  ← re-exports
│           ├── components.rs           ← RigidBody, Collider, PhysicsMaterial
│           ├── world.rs                ← pipeline Rapier2D + mapping EntityId↔Handle
│           └── bindings.rs             ← exports wasm-bindgen (Physics2DPlugin)
│
├── packages/
│   └──@djodjonx/gwen-
│       ├── engine-core/                ← Orchestrateur TS (Engine, WasmBridge…)
│       │   └── wasm/                   ← gwen_core_bg.wasm pré-compilé (CI)
│       ├── cli/                        ← gwen dev/build/prepare
│       ├── vite-plugin/                ← virtual modules, HMR, WASM middleware
│       ├── renderer-canvas2d/          ← Canvas2DRenderer
│       ├── plugin-input/               ← keyboard/mouse/gamepad
│       ├── plugin-audio/               ← Web Audio API
│       ├── plugin-debug/               ← FPS tracker + overlay
│       ├── plugin-html-ui/             ← UI HTML par entités
│       └── plugin-physics2d/           ← 🔜 Colle TS + wasm/ pré-compilé
│           ├── wasm/                   ← gwen_physics2d_bg.wasm pré-compilé (CI)
│           └── src/
│               └── index.ts            ← Physics2DPlugin (colle) + physics2D() helper
│
└── playground/
    └── space-shooter/                  ← Démo complète
```

---

## 14. Workflow Développeur Cible

```bash
# Créer un projet — zéro Rust requis
npm create gwen-app mon-jeu

# Ajouter la physique — simple npm install
npm install@djodjonx/gwen-plugin-physics2d

# Développement
gwen dev     # Vite HMR + WASM servi depuis node_modules

# Production
gwen build   # bundle TS + copie les .wasm depuis node_modules → dist/wasm/

# Déploiement
gwen preview
```

**L'utilisateur ne touche jamais** à Vite, Rust, `wasm-pack`, ni au bootstrap WASM.

---

## 15. Cibles de Performance

| Métrique | Cible |
|----------|-------|
| FPS stables | 60 FPS avec 10 000 entités actives |
| Taille WASM de base | < 150 KB (ECS + Transform) |
| Taille WASM physics | < 400 KB (Rapier2D) |
| Overhead SharedArrayBuffer | < 0.01 ms/frame |
| Physics step (1000 entités) | < 0.5 ms (Rapier2D natif) |
| TTI | < 2 s sur connexion standard |

---

## 16. Décisions Architecturales Clés (ADR)

| ADR | Décision | Raison |
|-----|----------|--------|
| **ADR-1** | Plugins WASM = `.wasm` séparés publiés dans npm | Rust jamais requis côté utilisateur — DX maximale |
| **ADR-2** | Communication inter-WASM via SharedArrayBuffer | Zéro copie entre les modules WASM, overhead ~0.01ms |
| **ADR-3** | Plugin TS = colle d'initialisation, zéro logique | La simulation reste 100% en Rust, TS n'est qu'un câbleur |
| **ADR-4** | TS pour la logique de jeu, Rust pour le moteur | Séparation claire, développeur de jeu ne touche pas à Rust |
| **ADR-5** | Configuration statique compile-time (`gwen.config.ts`) | Typage inféré, Tree-shaking, DX Nuxt-like |
| **ADR-6** | DSL `defineComponent()` avec `Types.*` | Zéro allocation par frame, serialize/deserialize compilés |
| **ADR-7** | Pure DI + Service Locator (`api.services`) | Testabilité, multi-instance, typage inféré automatiquement |

---

*Ce document est la source de vérité architecturale de GWEN. Toute décision technique doit être alignée avec ces principes.*
