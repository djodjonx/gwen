# GWEN — RFCs v3 : Évolution 3D / R3F

Ce dossier contient les RFCs pour l'évolution de GWEN vers un moteur de jeu 3D,
renderer-agnostique, compatible React Three Fiber.

**Objectif :** permettre la création d'un jeu comme Mario Kart JS avec GWEN comme moteur
(ECS, physique, boucle) et R3F comme renderer, en moins d'une journée de setup.

---

> **Canonical policy:** [`IMPLEMENTATION_PLAYBOOK_V2.md`](IMPLEMENTATION_PLAYBOOK_V2.md) is the single source of truth for all architecture decisions, PR ordering, and implementation contracts. All RFCs in this index are governed by it. In case of conflict between an RFC and the playbook, the playbook prevails.

---

## Execution playbook (for agents)

Use this document as the canonical implementation guide:

- [`IMPLEMENTATION_PLAYBOOK_V2.md`](IMPLEMENTATION_PLAYBOOK_V2.md)

It defines the frozen architecture decisions, ordered PR backlog, documentation requirements, and test/CI gates.

Current execution scope note:
- RFC-001 to RFC-009 are in active implementation scope.
- RFC-010 (Kit Kart) is explicitly deferred and excluded from the current run.

---

## Frozen Architecture Decisions

The following decisions are locked. Do not re-litigate them in individual RFCs.

1. **Ownership boundary:** Rust/core owns simulation correctness and memory lifecycle. JS/TS owns orchestration, input collection, and rendering.
2. **External loop:** JS calls `engine.advance(delta)`. Rust performs simulation. Delta is capped at `maxDeltaSeconds` (default `0.1`).
3. **Plugin interop:** default Plugin Data Bus (ArrayBuffer channels). Optional SAB opt-in with COOP/COEP headers.
4. **API shape:** `api.component.add/get/set/remove`, `api.entity.*`, query-first system authoring.
5. **Component DX:** core ships `Types.vec2/vec3/vec4/quat/color`. `defineComponent({ name, schema, defaults })`. No duplicate primitives across plugins.
6. **Package namespace:** `@djodjonx/*`.

See the playbook for full rationale and enforcement gates.

---

## RFCs par milestone

### Milestone 1 — API Foundation (breaking, engine-core)

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-001](RFC-001-query-system-v2.md) | Query System v2 — `query: [...]` dans `defineSystem` + typed iterator | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |
| [RFC-002](RFC-002-component-api-v2.md) | Component API v2 — `api.component.add/set/get` + `api.entity.tag` | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |
| [RFC-003](RFC-003-external-loop.md) | External Loop Control — `loop: 'external'` + `engine.advance(delta)` | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |

### Milestone 2 — 3D Core

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-004](RFC-004-3d-transform.md) | 3D Transform — STRIDE 48 + `Types.vec3/quat` + `Transform3D` | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |
| [RFC-005](RFC-005-physics3d.md) | Physics 3D Plugin — Rapier3D + `VehicleController` | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |

### Milestone 3 — R3F Integration

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-006](RFC-006-adapter-r3f.md) | R3F Adapter — `GwenProvider`, `GwenLoop`, hooks React | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |
| [RFC-007](RFC-007-math.md) | Math Utilities — `@gwen/math`, `damp`, `spring`, `vec3`, `quat` | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |

### Milestone 4 — Performance & DX

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-008](RFC-008-vite-transforms.md) | Vite Build Macros — compile vers TypedArray pur, auto-imports, HMR | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |
| [RFC-009](RFC-009-entity-physics-api.md) | Entity-native Physics — `EntityId` remplace les slots Rapier | Active — governed by IMPLEMENTATION_PLAYBOOK_V2.md |

### Milestone 5 — Kit

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-010](RFC-010-kit-kart.md) | Kit Kart — `spawnKart`, `KartPhysicsSystem`, drift, hooks | Deferred — out of current execution scope |

---

## Snapshot de suivi (actuel)

- [RFC_STATUS_SNAPSHOT_2026-03-29.md](RFC_STATUS_SNAPSHOT_2026-03-29.md)

---

## Principes transversaux

1. **Mécanismes, pas politiques** — GWEN ne sait pas ce qu'est un kart
2. **Zero-copy hot path** — après M4, le frame loop ne fait aucune allocation
3. **Renderer-agnostique** — Canvas2D, R3F, Three.js pur : même API GWEN
4. **Plugin = unité de déploiement** — publiable indépendamment
5. **Build-time is free** — tout ce qui peut être calculé à la compilation l'est
6. **DX first** — 30 min pour un kart qui roule
