# Sprint 1 - Contract and bridge

## PHYS-S1-001 - Stabiliser `Physics2DConfig` vNext

- Priority: P0
- Estimation: M
- Depends on: []
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`
- Objectif: contrat config clair (`qualityPreset`, `eventMode`, `compat flags`).
- Tests: type tests TS + compat compile usages existants.
- Docs: `packages/@djodjonx/plugin-physics2d/docs/API.md`.
- Perf: aucun surcout runtime.
- Risques: inflation API.
- DoD:
  - [ ] Types ajoutés sans casse
  - [ ] defaults documentes
  - [ ] jsdoc complet

## PHYS-S1-002 - Definir schema `extensions.physics` retro-compatible

- Priority: P0
- Estimation: L
- Depends on: [PHYS-S1-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/types.ts`, `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: preparer `colliders[]` tout en supportant legacy mono-collider.
- Tests: parse legacy + parse nouveau schema.
- Docs: examples avant/apres.
- Deprecations:
  - [ ] tagger `hw/hh/radius` top-level en `@deprecated`
  - [ ] ajouter inventaire migration
- Perf: zero alloc supplementaire a l instantiate.
- DoD:
  - [ ] adaptation legacy automatique
  - [ ] warning deprecation dev mode
  - [ ] migration note ecrite

## PHYS-S1-003 - Contrat bridge TS <-> WASM data-oriented

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S1-001]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/bindings.rs`, `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: formaliser payloads binaires et conventions de versions.
- Tests: integration decode/encode minimal.
- Docs: ajouter section bridge dans `specs/enhance-physic/02-api-dx-design.md`.
- Perf: eviter JSON hot path.
- DoD:
  - [ ] version de schema declaree
  - [ ] fallback erreur version documente
  - [ ] bridge base sur vues directes memoire WASM (`wasm.memory.buffer`) pour limiter copies/allocations

## PHYS-S1-004 - ADR hooks vs pull model

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S1-003]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/docs/HOOKS.md`
- Objectif: figer la regle "pull par defaut, hook batch optionnel".
- Tests: N/A
- Docs: examples d usage.
- DoD:
  - [ ] cas d usage documentes
  - [ ] anti-patterns documentes
  - [ ] precision: hooks interdits dans le hot path interne, helper opt-in uniquement

## PHYS-S1-005 - CI gate deprecation tagging

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S1-002]
- Fichiers cibles: `scripts/` (nouveau script), pipeline CI existant
- Objectif: echouer CI si symbole legacy non tagge (`@deprecated`/`#[deprecated]`).
- Tests: script teste sur faux positif/faux negatif minimal.
- Docs: `specs/enhance-physic/03-test-and-benchmark-strategy.md`.
- DoD:
  - [ ] script executable
  - [ ] integre a gate CI
  - [ ] message erreur actionnable

## PHYS-S1-006 - Bridge zero-copy contract (typed views)

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S1-003]
- Fichiers cibles: `crates/gwen-plugin-physics2d/src/bindings.rs`, `packages/@djodjonx/plugin-physics2d/src/index.ts`
- Objectif: standardiser l acces TS via `TypedArray` sur `wasm.memory.buffer`.
- Tests: integration lecture/ecriture buffers + test non-regression de perf allocations.
- Docs: `packages/@djodjonx/plugin-physics2d/docs/API.md` (section bridge perf).
- DoD:
  - [ ] format buffer versionne
  - [ ] zero serialisation JSON sur hot path
  - [ ] benchmark allocation avant/apres documente

## PHYS-S1-007 - Pull-first API policy enforcement

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S1-004]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/src/index.ts`, `packages/@djodjonx/plugin-physics2d/docs/HOOKS.md`
- Objectif: faire de `getCollisionEventsBatch` la voie recommandee et mesurer l usage hook opt-in.
- Tests: integration verifies pull path utilise dans systems de reference.
- DoD:
  - [ ] docs marquent pull comme first-class
  - [ ] helper hook batch clairement positionne convenience-only
