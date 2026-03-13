# Sprint 3 - Layers and masks

## PHYS-S3-001 - Bitset layers/masks cote Rust

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S2-003]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/components.rs`, `crates/gwen-plugin-physics2d/src/world.rs`
- Objectif: filtrage performant par collider.
- Tests: unit Rust allowed/blocked matrix.
- Perf: aucune branche inutile runtime.
- DoD:
  - [ ] model bitset stable
  - [ ] defaults explicites

## PHYS-S3-002 - Mapping noms layer -> bitset cote TS

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S3-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`, `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: DX lisible via noms de layers.
- Tests: unit TS mapping et validation.
- Docs: guide layers/masks.
- DoD:
  - [ ] erreurs claires sur layer inconnu
  - [ ] types stricts
  - [ ] erreur explicite si declaration > 32 layers (ou limite configuree)

## PHYS-S3-003 - Support layer/mask par collider dans extension

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S3-002]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`, `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: granularite head/body/foot.
- Tests: integration prefab multi-colliders + filtering.
- DoD:
  - [ ] layer global + override collider supportes
  - [ ] docs exemples valides

## PHYS-S3-004 - Scenarios playground filtering

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S3-003]
- Fichiers cibles: `playground/mario-css/src/`, `playground/space-shooter-2/src/`
- Objectif: valider collisions attendues en jeu.
- Tests: scenario playerFoot seulement ground.
- DoD:
  - [ ] scenario reproductible
  - [ ] notes de validation ajoutees

## PHYS-S3-005 - Docs API layers/masks

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S3-003]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/docs/API.md`
- Objectif: documentation claire sans `if tag` anti-perf.
- DoD:
  - [ ] matrice d exemples
  - [ ] bonnes pratiques perf

## PHYS-S3-006 - Guardrails limite layers et messages DX

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S3-002]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`, `packages/@djodjonx/plugin-physics2d/docs/API.md`
- Objectif: eviter configuration silencieusement invalide.
- Tests: unit TS cas 33e layer + snapshot message erreur.
- DoD:
  - [ ] message erreur actionnable (nom du layer, limite supportee)
  - [ ] doc limite bitset claire
  - [ ] exemple de contournement documente
