# Physics2D Enhancement - Overview

## Mission

Construire une evolution du plugin `physics2d` avec trois objectifs non negociables:

1. Performance maximale en runtime (simulation et contacts).
2. DX irreprochable (API claire, coherence extension/API/helpers, docs exemplaires).
3. Calculs de physique et derives pousses au maximum vers Rust/WASM.

## Scope

Le plan couvre:

- `crates/gwen-plugin-physics2d` (coeur Rust/WASM, simulation, events, stats).
- `packages/@djodjonx/plugin-physics2d` (API TS, integration engine, helpers, docs).
- playgrounds de reference pour validation gameplay/perf (`mario-css`, `space-shooter-2`).
- documentation plugin, migration, qualite code (rustdoc/jsdoc), packaging tree-shakable.

## Principes d architecture

- WASM-first: toute logique hot path va en Rust (step, collision filtering, event buffering, grounded, CCD/solver config).
- TS orchestration only: TS ne fait que config, lifecycle, mapping entites, consommation des batches d events.
- Data-oriented bridge: structures binaires stables entre TS et WASM, pas de serialisation JSON dans le hot path.
- API progressive: extension declarative par defaut, API imperative pour runtime dynamique, helpers pour patterns repetitifs.
- Non breaking first: compat descendante par defaut, deprecations explicites et mesurees.

## Decisions produit recommandees

- Event model: pull par defaut + hook batch optionnel.
- Grounded: calcule en Rust/WASM, expose via API et event de changement optionnel.
- Tilemap colliders: mode hybride precompute + chunks runtime.
- Qualite simulation: presets `low|medium|high|esport` + override per-body.
- Migration: flags legacy progressifs sur au moins un cycle mineur.

## Resultat attendu cote utilisateur final

Un dev doit pouvoir:

- declarer un prefab statique avec `extensions.physics` en 10-20 secondes.
- declarer un player multi-colliders (`head`, `body`, `foot`) sans glue code fragile.
- brancher collisions/grounded avec une API previsible, stable, typée.
- choisir un preset perf/precision global sans comprendre les details solver.
- ne payer au runtime que ce qui est utilise (tree shaking + entry points clairs).

## KPI globaux (proposes)

- JS overhead orchestration <= 0.60 ms p95 dans scene de reference.
- Allocations JS hot path ~0/frame (pooling obligatoire sur events).
- Throughput events >= 50k/s soutenu sans drop non trace.
- `droppedEvents` = 0 en scenario nominal, et telemetrie disponible en charge.
- Regression gameplay critique = 0 sur scenes de reference.

## Definition of Done globale

- API publiee, documentee, type-safe, avec exemples extension + imperative + helpers.
- Tous les lots ont tests unitaires + integration + perf associes.
- Rust public API documentee avec rustdoc; TS public API documentee avec jsdoc.
- Rapport de benchmarks avant/apres valide les gains annonces.
- Verification tree shaking et taille package documentee.
- Guide migration disponible avec checklists et exemples avant/apres.

## Timeline macro (sprint 1 -> 8)

- Sprint 1-2: API contract + pipeline events performant.
- Sprint 3-4: grounded natif + layers/masks robustes.
- Sprint 5-6: tilemap composite/chunk + multi-colliders + materials.
- Sprint 7-8: solver/CCD presets + migration + hardening release.

## Liens vers les specs detaillees

- `specs/enhance-physic/01-roadmap-implementation.md`
- `specs/enhance-physic/02-api-dx-design.md`
- `specs/enhance-physic/03-test-and-benchmark-strategy.md`
- `specs/enhance-physic/04-doc-and-migration-plan.md`
- `specs/enhance-physic/05-tree-shaking-and-build-plan.md`

