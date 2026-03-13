# Sprint 7 - Solver and CCD presets

## PHYS-S7-001 - Presets qualite globaux

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S1-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`, `crates/gwen-plugin-physics2d/src/world.rs`
- Objectif: `low|medium|high|esport` utilisables sans expertise physique.
- Tests: unit mapping preset -> config solver.
- DoD:
  - [ ] defaults determines
  - [ ] matrix perf/stabilite documentee

## PHYS-S7-002 - CCD global + per-body override

- Priority: P0
- Estimation: L
- Depends on: [PHYS-S7-001]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/world.rs`, `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: reduire tunneling objets rapides.
- Tests: scenario projectile rapide.
- Perf: eval cout CPU par preset.
- DoD:
  - [ ] override prioritaire documente
  - [ ] tunnel rate mesure

## PHYS-S7-003 - Solver iterations overrides per body

- Priority: P1
- Estimation: M
- Depends on: [PHYS-S7-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`, `crates/gwen-plugin-physics2d/src/components.rs`
- Objectif: controle fin cas speciaux.
- Tests: integration precedence global vs local.
- DoD:
  - [ ] options type-safe
  - [ ] guardrails anti-abus documentes

## PHYS-S7-004 - Bench comparatifs presets

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S7-002, PHYS-S7-003]
- Fichiers cibles: bench scripts + rapport spec
- Objectif: publier p50/p95 + tunnel rate + stability.
- DoD:
  - [ ] tableau comparatif archive
  - [ ] recommendation preset par genre de jeu

## PHYS-S7-005 - Deprecate anciens reglages solver legacy

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S7-001]
- Fichiers cibles: TS types + Rust bindings + migration docs
- Objectif: converger vers nouveaux presets.
- Deprecations:
  - [ ] tags code TS/Rust
  - [ ] inventaire maj
- Tests: compat path maintenu.
- DoD:
  - [ ] warning migration present
  - [ ] suppression planifiee

## PHYS-S7-006 - Observabilite solver/CCD (debug tooling)

- Priority: P1
- Estimation: M
- Depends on: [PHYS-S7-002, PHYS-S7-004]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`, `packages/@djodjonx/plugin-debug/` (integration), docs debug
- Objectif: aider a comprendre cout physique et collisions rapides en dev.
- Tests: integration debug panel + smoke test absence impact prod.
- Perf: instrumentation inactive par defaut en prod.
- DoD:
  - [ ] stats solver/CCD exposees (`stepMs`, `ccdSweeps`, `activeContacts`)
  - [ ] overlay/debug hooks optionnels
  - [ ] docs "diagnostiquer les perfs" ajoutees
