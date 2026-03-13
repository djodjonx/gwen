# Sprint 2 - Event pipeline

## PHYS-S2-001 - Ring buffer events cote Rust

- Priority: P0
- Estimation: L
- Depends on: [PHYS-S1-003]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/world.rs`
- Objectif: bufferiser collision/trigger sans spam TS.
- Tests: unit Rust push/pop, wrap-around, overflow counters.
- Perf: throughput >= 50k/s cible.
- Risques: overflow sous pic.
- DoD:
  - [ ] ring buffer stable
  - [ ] counters drops exposes
  - [ ] politique overflow definie (resize limite + backpressure)

## PHYS-S2-002 - Coalescing contacts par frame

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S2-001]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/world.rs`
- Objectif: reduire bruit evenements (`start/stay/end`).
- Tests: unit Rust ordre et dedup.
- Perf: reduction volume events/frame.
- DoD:
  - [ ] coalescing optionnel configurable
  - [ ] ordre garanti documente

## PHYS-S2-003 - API `getCollisionEventsBatch`

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S2-001, PHYS-S2-002]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`, `packages/@djodjonx/plugin-physics2d/src/types.ts`
- Objectif: pull API batch pour consommation gameplay.
- Tests: integration TS+WASM lecture batches.
- Docs: `docs/API.md` + exemple system.
- DoD:
  - [ ] payload type-safe
  - [ ] droppedSinceLastRead present

## PHYS-S2-004 - Hook batch optionnel

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S2-003]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: convenience DX `physics:collision:batch`.
- Tests: integration hook called once/frame max.
- Perf: pas de duplication de lecture batch.
- DoD:
  - [ ] hook opt-in uniquement
  - [ ] docs anti-usage intensif
  - [ ] hook execute hors hot path interne

## PHYS-S2-005 - Pooling objets events cote TS

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S2-003]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: allocations hot path proches de zero.
- Tests: benchmark allocations/frame.
- Perf: <= baseline allocations cible.
- DoD:
  - [ ] pool en place
  - [ ] mesure allocation ajoutee

## PHYS-S2-006 - Bench event pipeline + rapport

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S2-005]
- Fichiers cibles: `crates/gwen-plugin-physics2d/tests/`, `packages/@djodjonx/plugin-physics2d/tests/`, `specs/enhance-physic/03-test-and-benchmark-strategy.md`
- Objectif: baseline p50/p95 + throughput + dropped.
- DoD:
  - [ ] script bench reproductible
  - [ ] rapport avant/apres archive

## PHYS-S2-007 - Canal events critiques gameplay

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S2-001]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/world.rs`, `packages/@djodjonx/plugin-physics2d/src/types.ts`
- Objectif: garantir les triggers critiques (ex: fin niveau) avant drop d events non critiques.
- Tests: stress test avec saturation; verification non-perte events critiques.
- Perf: limiter cout avec file prioritaire born ee.
- DoD:
  - [ ] classification critique/non-critique documentee
  - [ ] telemetry separee (`droppedCritical`, `droppedNonCritical`)
  - [ ] comportement overflow deterministe

## PHYS-S2-008 - Resize dynamique buffer avec limite

- Priority: P1
- Estimation: M
- Depends on: [PHYS-S2-001]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/world.rs`
- Objectif: absorber pics courts avant drop.
- Tests: bench charge en pic, verification seuils max.
- DoD:
  - [ ] croissance par paliers documentee
  - [ ] limite haute configurable
  - [ ] retour a baseline si possible (shrink policy)
