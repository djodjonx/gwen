# Physics2D Enhancement - Roadmap implementation

## Objectif

Fournir un plan executable sprint 1-8 avec:

- lots incrementaux,
- dependances,
- risques,
- criteres d acceptation,
- gates qualite (tests, docs, perf) sur chaque lot.

## Working model

Chaque lot suit ce cycle:

1. Design court (ADR + types).
2. Implementation Rust/WASM hot path.
3. Integration TS et ergonomie API.
4. Tests unitaires + integration + bench minimal.
5. Documentation code + doc plugin.
6. Verification perf et compat.

---

## Sprint 1 - Contrat API et architecture bridge

### Livrables

- Contrat `Physics2DConfig` vNext (presets qualite, event mode, compat flags).
- Contrat `extensions.physics` retro-compatible.
- Contrat event batch pull API.
- ADR: repartition TS vs Rust/WASM.

### Fichiers cibles (proposes)

- `packages/@djodjonx/plugin-physics2d/src/types.ts`
- `packages/@djodjonx/plugin-physics2d/src/index.ts`
- `crates/gwen-plugin-physics2d/src/bindings.rs`
- `specs/enhance-physic/02-api-dx-design.md`

### Risques

- API trop large trop tot.
- Ambiguite des unites (px/metres).

### Mitigation

- garder des options minimales et typage strict.
- documenter clairement les unites et conventions.

### Acceptance

- examples existants continuent de compiler sans changement.
- nouvelles options optionnelles uniquement.

### Definition of Done Sprint 1

- [ ] Types TS valides.
- [ ] Contrat bridge documente.
- [ ] Compat descendante validee.

---

## Sprint 2 - Pipeline events performant (collision/trigger)

### Livrables

- Ring buffer events cote Rust.
- API pull en batch cote TS.
- Hook batch optionnel (`physics:collision:batch`).
- Telemetrie: `bufferUsage`, `droppedEvents`, `eventsPerFrame`.

### Fichiers cibles (proposes)

- `crates/gwen-plugin-physics2d/src/world.rs`
- `crates/gwen-plugin-physics2d/src/bindings.rs`
- `packages/@djodjonx/plugin-physics2d/src/index.ts`
- `packages/@djodjonx/plugin-physics2d/src/types.ts`

### Risques

- overflow du buffer sous charge.
- ordre des events mal defini.

### Mitigation

- watermark + compteurs drops + doc ordre.
- tests wrap-around et stress.

### Acceptance

- aucune allocation TS par event unitaire.
- latence events <= 1 frame.

### Definition of Done Sprint 2

- [ ] Bench throughput events.
- [ ] Hook batch optionnel stable.
- [ ] API pull documentee.

---

## Sprint 3 - Layers/masks par collider

### Livrables

- categories + masks par collider.
- matrix globale configurable.
- docs exemples de filtering sans `if tag` en boucle.

### Fichiers cibles (proposes)

- `crates/gwen-plugin-physics2d/src/world.rs`
- `crates/gwen-plugin-physics2d/src/components.rs`
- `packages/@djodjonx/plugin-physics2d/src/types.ts`
- `packages/@djodjonx/plugin-physics2d/docs/API.md`

### Risques

- confusion layer globale vs locale.

### Mitigation

- conventions simples (`layer`, `mask[]`) + valeur par defaut.

### Acceptance

- scenario collision filtrage valide dans playground.

### Definition of Done Sprint 3

- [ ] Unit tests filtering Rust.
- [ ] Integration tests TS.
- [ ] Exemples docs valides.

---

## Sprint 4 - Grounded natif WASM

### Livrables

- calcul grounded en Rust (sensor/contact profiling).
- `getGroundState(entity)` + event optionnel de changement.
- helper TS `createPhysicsGroundedSystem` zero boilerplate.

### Fichiers cibles (proposes)

- `crates/gwen-plugin-physics2d/src/world.rs`
- `packages/@djodjonx/plugin-physics2d/src/index.ts`
- `packages/@djodjonx/plugin-physics2d/src/systems.ts`

### Risques

- faux positifs aux rebords/pentes.

### Mitigation

- profils grounded (`strict`, `platformer`) + tolerances testees.

### Acceptance

- tests mario: saut autorise/interdit correctement.

### Definition of Done Sprint 4

- [ ] Non-regression platformer.
- [ ] API grounded documentee.
- [ ] KPI grounded p95 mesure.

---

## Sprint 5 - Multi-colliders prefab (head/body/foot)

### Livrables

- `extensions.physics.colliders[]` (avec retro-compat mono-collider).
- IDs de collider (`head`, `body`, `foot`) exposes dans events.
- support sensors distincts par collider.

### Fichiers cibles (proposes)

- `packages/@djodjonx/plugin-physics2d/src/types.ts`
- `packages/@djodjonx/plugin-physics2d/src/index.ts`
- `crates/gwen-plugin-physics2d/src/components.rs`
- `playground/mario-css/src/prefabs/TilePrefabs.ts` (exemples)

### Risques

- complexite migration schema extension.

### Mitigation

- adapter legacy auto si `hw/hh` top-level.
- warnings de deprecation clairs.

### Acceptance

- player prefab avec tete/corps/pieds fonctionnel.

### Definition of Done Sprint 5

- [ ] Compat legacy validee.
- [ ] events incluent colliderId.
- [ ] exemple doc player multi-collider.

---

## Sprint 6 - Tilemap composite/chunk + materials presets

### Livrables

- helper precompute tilemap -> chunks physiques.
- runtime load/unload chunks.
- presets materials (`default`, `ice`, `rubber`) + custom.

### Fichiers cibles (proposes)

- `packages/@djodjonx/plugin-physics2d/src/helpers/tilemap.ts`
- `crates/gwen-plugin-physics2d/src/world.rs`
- `packages/@djodjonx/plugin-physics2d/src/types.ts`

### Risques

- temps de build des chunks.
- mismatch precompute/runtime.

### Mitigation

- checksum format chunk.
- fallback mode naive pour debug.

### Acceptance

- baisse nette du nombre colliders actifs sur map tuiles.

### Definition of Done Sprint 6

- [ ] Bench create scene avant/apres.
- [ ] Guide usage tilemap publie.
- [ ] Presets materials testes.

---

## Sprint 7 - Presets solver/CCD + overrides

### Livrables

- presets `low|medium|high|esport`.
- override per-body (`ccd`, iterations).
- stats comparatives perf/stabilite par preset.

### Fichiers cibles (proposes)

- `packages/@djodjonx/plugin-physics2d/src/types.ts`
- `packages/@djodjonx/plugin-physics2d/src/index.ts`
- `crates/gwen-plugin-physics2d/src/world.rs`

### Risques

- presets non intuitifs.

### Mitigation

- matrice de choix claire dans docs.

### Acceptance

- cas tunneling corrige avec preset/override adapte.

### Definition of Done Sprint 7

- [ ] Bench presets publies.
- [ ] exemple projectile rapide valide.
- [ ] docs tuning completees.

---

## Sprint 8 - Hardening, migration, release

### Livrables

- guide migration complet + deprecations.
- docs plugin finalisees.
- rapport perf final et check tree shaking.
- release notes et checklist QA.

### Fichiers cibles (proposes)

- `packages/@djodjonx/plugin-physics2d/README.md`
- `packages/@djodjonx/plugin-physics2d/docs/*`
- `packages/@djodjonx/plugin-physics2d/CHANGELOG.md`
- `specs/enhance-physic/04-doc-and-migration-plan.md`
- `specs/enhance-physic/05-tree-shaking-and-build-plan.md`

### Risques

- dette doc de fin de projet.

### Mitigation

- doc comme gate de merge sur chaque lot.

### Acceptance

- migration dry-run passee sur un playground.

### Definition of Done Sprint 8

- [ ] release candidate validee.
- [ ] migration guide verifie.
- [ ] baseline perf archivee.

---

## Dependances cles

- Events batch (S2) avant benchmarks robustes (S6-S7).
- Layers/masks (S3) avant grounded fiable (S4).
- Multi-colliders (S5) avant player DX final.
- Tilemap chunks (S6) avant perf map finale.

## Gates transverses (a chaque sprint)

- [ ] Unit tests ajoutes et passes.
- [ ] Integration tests ajoutes et passes.
- [ ] Bench mini mis a jour.
- [ ] rustdoc/jsdoc sur API exposee.
- [ ] docs plugin mises a jour.
- [ ] verification compat et deprecations.
- [ ] toute API/type/propriete depreciee est taggee dans le code (`@deprecated` TS, `#[deprecated(...)]` Rust).
- [ ] le code legacy associe aux deprecations est couvert par tests de compat.
