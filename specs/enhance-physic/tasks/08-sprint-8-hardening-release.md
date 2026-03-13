# Sprint 8 - Hardening and release

## PHYS-S8-001 - Audit deprecations complet

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S5-004, PHYS-S7-005]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`, code TS/Rust impacte
- Objectif: aucune deprecation non taggee ou non tracee.
- Tests: script CI deprecation vert.
- DoD:
  - [ ] inventaire complet
  - [ ] since/removal/replacement renseignes

## PHYS-S8-002 - Tree-shaking packaging final

- Priority: P0
- Estimation: L
- Depends on: [PHYS-S6-001, PHYS-S7-001]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/package.json`, entry points src
- Objectif: `core`, `helpers`, `tilemap`, `debug` tree-shakables.
- Tests: bundle smoke tests core-only vs full.
- Perf: reduction taille bundle non utilise.
- DoD:
  - [ ] exports map finalisee
  - [ ] `sideEffects` valide
  - [ ] rapport taille bundle archive

## PHYS-S8-003 - Suite e2e playgrounds

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S6-004, PHYS-S7-004]
- Fichiers cibles: `playground/mario-css/`, `playground/space-shooter-2/`, scripts tests
- Objectif: non-regression gameplay et perf de reference.
- Tests: scenarios automatiques principaux.
- DoD:
  - [ ] run reproductible
  - [ ] baseline comparee

## PHYS-S8-004 - Documentation finale plugin

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S8-001, PHYS-S8-002]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/README.md`, `packages/@djodjonx/plugin-physics2d/docs/*`
- Objectif: doc complete extension/API/helpers/hooks/migration.
- DoD:
  - [ ] quick start valide
  - [ ] guide migration final
  - [ ] rustdoc/jsdoc complete

## PHYS-S8-005 - Release notes + changelog + checklist QA

- Priority: P1
- Estimation: S
- Depends on: [PHYS-S8-004]
- Fichiers cibles: `packages/@djodjonx/plugin-physics2d/CHANGELOG.md`, docs release
- Objectif: publication propre et exploitable.
- DoD:
  - [ ] breaking/deprecated/new/perf sectionnees
  - [ ] check QA signee

## PHYS-S8-006 - Retrospective perf/DX et backlog v2

- Priority: P2
- Estimation: S
- Depends on: [PHYS-S8-003, PHYS-S8-005]
- Fichiers cibles: `specs/enhance-physic/` (nouveau rapport)
- Objectif: capturer gains reels et dettes restantes.
- DoD:
  - [ ] KPIs compares aux objectifs
  - [ ] backlog post-release priorise

## PHYS-S8-007 - Perf Score CI bloqueur regression

- Priority: P0
- Estimation: M
- Depends on: [PHYS-S2-006, PHYS-S6-004, PHYS-S7-004]
- Fichiers cibles: scripts CI/bench, `specs/enhance-physic/03-test-and-benchmark-strategy.md`
- Objectif: automatiser un score perf stable et gate de regression pour PRs critiques.
- Tests: dry-run CI + simulation regression pour verifier blocage.
- DoD:
  - [ ] score agrege defini (step p95, allocations, dropped events, tunnel rate)
  - [ ] seuils bloqueurs configures
  - [ ] rapport CI publie par PR
