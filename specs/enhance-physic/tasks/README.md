# Physics2D Tasks - Index

Ce dossier contient le backlog d execution pour ton agent.

## Mode d emploi agent

- Executer les taches dans l ordre du chemin critique ci-dessous.
- Respecter les dependances indiquees par tache.
- Ne jamais merger une tache sans ses gates tests/docs/perf.
- Toute deprecation doit etre taggee dans le code (`@deprecated` TS, `#[deprecated(...)]` Rust) et tracee dans l inventaire migration.
- Utiliser `agent-runbook.md` comme reference d execution (ordre strict + stop/go par sprint).

## Fichiers

- `00-task-template.md`
- `agent-runbook.md`
- `01-sprint-1-contract-and-bridge.md`
- `02-sprint-2-event-pipeline.md`
- `03-sprint-3-layers-masks.md`
- `04-sprint-4-grounded-native.md`
- `05-sprint-5-multi-colliders.md`
- `06-sprint-6-tilemap-materials.md`
- `07-sprint-7-solver-ccd-presets.md`
- `08-sprint-8-hardening-release.md`

## Chemin critique

1. S1: contrat API + bridge TS/WASM (zero-copy)
2. S2: pipeline events batch + telemetrie + overflow strategy
3. S3: layers/masks par collider
4. S4: sensors natifs Rust + helper grounded derive
5. S5: multi-colliders prefab + compat TS-only
6. S6: tilemap chunks + patch incremental + materials
7. S7: presets solver/CCD + observabilite debug
8. S8: migration finale + release + tree-shaking + perf score CI

## Parallele possible

- Doc continue en parallele de chaque sprint.
- Bench/perf tooling parallele a partir de S2.
- Tree-shaking prep parallele en S6-S7, validation finale en S8.

## Gates transverses obligatoires (chaque tache)

- [ ] Tests unitaires impactes ajoutes/maj.
- [ ] Tests integration impactes ajoutes/maj.
- [ ] Bench ou mesure perf si runtime touche.
- [ ] rustdoc/jsdoc ajoutes sur symboles publics.
- [ ] Deprecations taggees dans le code + inventaire migre.
- [ ] Docs plugin mises a jour.
- [ ] Hot path: pull-first, hooks uniquement opt-in hors chemin critique.
- [ ] Bridge: pas de JSON hot path; typed views WASM quand applicable.
