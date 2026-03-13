# Sprint 4 - Sensors natifs et grounded derive

## PHYS-S4-001 - Systeme sensors persistant calcule en Rust

- Priority: P0
- Estimation: L
- Depends on: [PHYS-S3-001]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/world.rs`
- Objectif: fournir un primitive agnostique (sensors persistants / shapecasts) au lieu de coder un concept gameplay specifique.
- Tests: unit Rust transitions contact sensor + edge cases.
- Perf: cout <= 0.05 ms p95 pour 1k sensors suivis.
- DoD:
  - [ ] cache state sensor stable
  - [ ] pas de notion hardcodee de "ground" dans le coeur

## PHYS-S4-002 - API `getSensorState(entity, sensorId)`

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S4-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`, `packages/@djodjonx/plugin-physics2d/src/types.ts`
- Objectif: lecture gameplay deterministic pour tous les genres de jeu.
- Tests: integration TS+WASM sur plusieurs frames.
- DoD:
  - [ ] type SensorState documente
  - [ ] latence <= 1 frame

## PHYS-S4-003 - Event optionnel `physics:sensor:changed`

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S4-002]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: DX events sur transition sensor.
- Tests: integration event transition uniquement.
- Perf: event emit uniquement sur changement.
- DoD:
  - [ ] pas d event spam stay
  - [ ] doc usage claire

## PHYS-S4-004 - Helper `createPlatformerGroundedSystem`

- Priority: P1
- Estimation: M
- Depends on: [PHYS-S4-002]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/systems.ts`
- Objectif: deriver `isGrounded` a partir d un sensor `foot` sans polluer le core.
- Tests: unit helper + integration scene mario.
- DoD:
  - [ ] helper tree-shakable
  - [ ] jsdoc perf notes
  - [ ] logique grounded encapsulee hors coeur Rust

## PHYS-S4-005 - Validation gameplay mario grounded

- Priority: P0
- Estimation: S
- Depends on: [PHYS-S4-004]
- Fichiers cibles: `playground/mario-css/src/`
- Objectif: valider saut autorise/interdit proprement via sensor foot.
- Tests: scenario platformer baseline.
- DoD:
  - [ ] non-regression constatee
  - [ ] resultat documente

## PHYS-S4-006 - Migration helper legacy grounded -> sensors

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S4-004]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`, `packages/@djodjonx/plugin-physics2d/src/systems.ts`
- Objectif: guider la transition vers le modele agnostique.
- Deprecations:
  - [ ] tag `@deprecated` sur helper grounded legacy si present
  - [ ] inventaire deprecations maj
- DoD:
  - [ ] exemple avant/apres publie
  - [ ] tests compat helper legacy
