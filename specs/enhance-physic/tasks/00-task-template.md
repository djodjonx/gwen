# Task Template (a copier)

## [ID] Titre

- Priority: P0 | P1 | P2
- Estimation: S | M | L
- Sprint: S1..S8
- Depends on: [IDs]
- Owners: Rust | TS | Docs | QA

### Objectif

Description courte de la valeur produite.

### Implementation

- Cote Rust/WASM:
  - `crates/gwen-plugin-physics2d/src/...`
- Cote TS/plugin:
  - `packages/@djodjonx/plugin-physics2d/src/...`
- Cote docs:
  - `packages/@djodjonx/plugin-physics2d/docs/...`

### Fichiers cibles

- `path/1`
- `path/2`

### Tests a ecrire/mettre a jour

- Unit Rust:
- Unit TS:
- Integration TS+WASM:
- Scenario playground:
- Perf bench:

### Docs a mettre a jour

- API:
- MIGRATION:
- README:
- rustdoc/jsdoc:

### Deprecation policy

- [ ] Symboles legacy tagges `@deprecated` (TS/JSDoc).
- [ ] Symboles legacy tagges `#[deprecated(since = "...", note = "...")]` (Rust).
- [ ] Inventaire deprecations mis a jour.

### Impact perf attendu

Expliquer le gain attendu ou le non-impact.

### Risques

- risque 1
- risque 2

### Definition of Done

- [ ] Feature implantee.
- [ ] Tests pass.
- [ ] Bench pass / baseline maj.
- [ ] Docs et migration maj.
- [ ] Gate deprecation valide.

