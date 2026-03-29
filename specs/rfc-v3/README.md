# GWEN — RFCs v3 : Évolution 3D / R3F

Ce dossier contient les RFCs pour l'évolution de GWEN vers un moteur de jeu 3D,
renderer-agnostique, compatible React Three Fiber.

**Objectif :** permettre la création d'un jeu comme Mario Kart JS avec GWEN comme moteur
(ECS, physique, boucle) et R3F comme renderer, en moins d'une journée de setup.

---

## RFCs par milestone

### Milestone 1 — API Foundation (breaking, engine-core)

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-001](RFC-001-query-system-v2.md) | Query System v2 — `query: [...]` dans `defineSystem` + typed iterator | Draft |
| [RFC-002](RFC-002-component-api-v2.md) | Component API v2 — `api.component.add/set/get` + `api.entity.tag` | Draft |
| [RFC-003](RFC-003-external-loop.md) | External Loop Control — `loop: 'external'` + `engine.advance(delta)` | Draft |

### Milestone 2 — 3D Core

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-004](RFC-004-3d-transform.md) | 3D Transform — STRIDE 48 + `Types.vec3/quat` + `Transform3D` | Draft |
| [RFC-005](RFC-005-physics3d.md) | Physics 3D Plugin — Rapier3D + `VehicleController` | Draft |

### Milestone 3 — R3F Integration

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-006](RFC-006-adapter-r3f.md) | R3F Adapter — `GwenProvider`, `GwenLoop`, hooks React | Draft |
| [RFC-007](RFC-007-math.md) | Math Utilities — `@gwen/math`, `damp`, `spring`, `vec3`, `quat` | Draft |

### Milestone 4 — Performance & DX

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-008](RFC-008-vite-transforms.md) | Vite Build Macros — compile vers TypedArray pur, auto-imports, HMR | Draft |
| [RFC-009](RFC-009-entity-physics-api.md) | Entity-native Physics — `EntityId` remplace les slots Rapier | Draft |

### Milestone 5 — Kit

| RFC | Titre | Statut |
|-----|-------|--------|
| [RFC-010](RFC-010-kit-kart.md) | Kit Kart — `spawnKart`, `KartPhysicsSystem`, drift, hooks | Draft |

---

## Principes transversaux

1. **Mécanismes, pas politiques** — GWEN ne sait pas ce qu'est un kart
2. **Zero-copy hot path** — après M4, le frame loop ne fait aucune allocation
3. **Renderer-agnostique** — Canvas2D, R3F, Three.js pur : même API GWEN
4. **Plugin = unité de déploiement** — publiable indépendamment
5. **Build-time is free** — tout ce qui peut être calculé à la compilation l'est
6. **DX first** — 30 min pour un kart qui roule
