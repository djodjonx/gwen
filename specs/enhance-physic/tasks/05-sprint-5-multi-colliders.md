# Sprint 5 - Multi-colliders prefab

## PHYS-S5-001 - Schema `colliders[]` complet

- Priority: P0
- Estimation: L
- Depends on: [PHYS-S1-002, PHYS-S3-003]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`
- Objectif: permettre `head/body/foot` et sensors differencies.
- Tests: type tests TS + validation schema.
- DoD:
  - [ ] `id`, `offset`, `groundedRole` supportes
  - [ ] jsdoc detaille

## PHYS-S5-002 - Instantiation multi-colliders runtime

- Priority: P0
- Estimation: L
- Depends on: [PHYS-S5-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`, `crates/gwen-plugin-physics2d/src/components.rs`
- Objectif: attacher plusieurs colliders a un rigid body.
- Tests: integration creation/suppression colliders multiples.
- Perf: pas de boucle TS superflue par frame.
- DoD:
  - [ ] handle mapping stable
  - [ ] erreurs config claires

## PHYS-S5-003 - Event payload avec `aColliderId/bColliderId`

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S2-003, PHYS-S5-002]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/world.rs`, `packages/@djodjonx/plugin-physics2d/src/types.ts`
- Objectif: gameplay specifique par zone de collision.
- Tests: integration collisions tete/pieds.
- DoD:
  - [ ] IDs propages en batch
  - [ ] fallback si id absent

## PHYS-S5-004 - Compat legacy mono-collider et deprecations

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S5-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`, `packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`
- Objectif: transition progressive.
- Tests: compat legacy + nouveau chemin.
- Deprecations:
  - [ ] `@deprecated` sur props legacy
  - [ ] inventaire maj (`since/removal/replacement`)
- DoD:
  - [ ] warnings non bloquants
  - [ ] migration examples ajoutes
  - [ ] normalisation legacy effectuee cote TS avant envoi Rust

## PHYS-S5-005 - Example player `head/body/foot`

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S5-003]
- Fichiers cibles: `playground/mario-css/src/prefabs/`
- Objectif: reference DX copy/paste.
- Tests: scenario head hit block, foot grounded, body wall.
- DoD:
  - [ ] example documente
  - [ ] fonctionne sur playground

## PHYS-S5-006 - Rust single-path multi-colliders only

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S5-004]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/components.rs`, `crates/gwen-plugin-physics2d/src/world.rs`
- Objectif: eliminer la dette de double chemin dans le coeur Rust.
- Tests: unit/integration verifies aucune branche legacy cote Rust.
- Perf: simplification hot path et maintenance.
- DoD:
  - [ ] Rust ne recoit que `colliders[]`
  - [ ] toute compat legacy reste dans adaptateur TS
  - [ ] docs architecture mises a jour
