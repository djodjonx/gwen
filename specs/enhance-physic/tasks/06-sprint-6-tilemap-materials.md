# Sprint 6 - Tilemap chunks and materials

## PHYS-S6-001 - Helper `buildTilemapPhysicsChunks`

- Priority: P0
- Estimation: L
- Depends on: [PHYS-S5-002]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/helpers/tilemap.ts`
- Objectif: precompute colliders composites par chunk.
- Tests: unit bake validity + checksum.
- Perf: reduire colliders actifs et cout build runtime.
- DoD:
  - [ ] format chunk versionne
  - [ ] docs usage ajoutees
  - [ ] API prevue pour patch incremental de chunk

## PHYS-S6-002 - Runtime load/unload chunks

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S6-001]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/world.rs`, `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: streaming map performant.
- Tests: integration deterministic load/unload.
- DoD:
  - [ ] API load/unload stable
  - [ ] fallback debug mode naive

## PHYS-S6-003 - Presets materials + override custom

- Priority: P1
- Estimation: M
- Depends on: [PHYS-S5-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`, `crates/gwen-plugin-physics2d/src/components.rs`
- Objectif: friction/restitution simples a utiliser.
- Tests: unit mapping presets -> valeurs physiques.
- DoD:
  - [ ] `default|ice|rubber` dispo
  - [ ] custom possible

## PHYS-S6-004 - Bench tilemap avant/apres

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S6-002]
- Fichiers cibles: `playground/mario-css/src/`, scripts bench
- Objectif: mesurer gains CPU/loading et colliders count.
- DoD:
  - [ ] rapport chiffre archive
  - [ ] regression budget defini

## PHYS-S6-005 - Docs `TILEMAP.md` + migration examples

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S6-001, PHYS-S6-003]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/docs/TILEMAP.md`, `packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`
- Objectif: guide clair pour adopter chunks/materials.
- DoD:
  - [ ] snippets verifies
  - [ ] perf tips documentes

## PHYS-S6-006 - Incremental chunk patch API

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S6-001, PHYS-S6-002]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/helpers/tilemap.ts`, `packages/@djodjonx/plugin-physics2d/src/index.ts`, `crates/gwen-plugin-physics2d/src/world.rs`
- Objectif: mettre a jour un chunk specifique sans rebake global (terrain destructible).
- Tests: integration patch local + non-regression des chunks voisins.
- Perf: cout patch borne et stable.
- DoD:
  - [ ] API `patchTilemapPhysicsChunk` documentee
  - [ ] patch deterministic avec checksum maj
  - [ ] bench patch vs full rebake archive
