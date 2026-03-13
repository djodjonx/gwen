# Physics2D Enhancement - Documentation and migration plan

## Objectif

Avoir une documentation plugin complete, maintenable, et align ee sur la DX cible.

## Structure documentation proposee

- `packages/@djodjonx/plugin-physics2d/README.md`
  - quick start,
  - installation,
  - minimal example.
- `packages/@djodjonx/plugin-physics2d/docs/API.md`
  - reference complete TS.
- `packages/@djodjonx/plugin-physics2d/docs/HOOKS.md`
  - lifecycle, events, pull model.
- `packages/@djodjonx/plugin-physics2d/docs/HELPERS.md`
  - grounded, kinematic sync, collision batch.
- `packages/@djodjonx/plugin-physics2d/docs/TILEMAP.md`
  - bake/chunks, perf tips.
- `packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`
  - legacy -> vNext.

## Exigences de documentation code

## Rust (rustdoc)

- documenter toutes les structs/enums/fns publiques.
- inclure exemples d usage sur API exposee WASM.
- indiquer complexite/perf quand utile (ex: O(n), allocations).
- tagger toute API/type/champ legacy avec `#[deprecated(since = "...", note = "...")]`.
- documenter la migration directe dans le `note` (vers quoi migrer).

## TS (jsdoc)

- documenter toutes les interfaces/fonctions exportees.
- preciser defaults, contraintes, impacts perf.
- tagger les options legacy/deprecated.
- utiliser `@deprecated` sur methodes, types et proprietes legacy.
- inclure version d introduction de la deprecation + cible de suppression + alternative.

## Politique deprecation obligatoire (code + doc)

- Interdit: deprecation seulement dans markdown.
- Obligation: le marquage doit exister dans le code source Rust et TS.
- Obligation: chaque deprecation possede un test de compat et un test du chemin de remplacement.
- Obligation: chaque deprecation a un ticket de suppression planifie (version cible).

Exemple TS/JSDoc:

```ts
/**
 * @deprecated Since 0.9.0. Use `colliders` instead. Removal planned in 1.1.0.
 */
hw?: number;
```

Exemple Rust:

```rust
#[deprecated(since = "0.9.0", note = "Use add_collider_v2; will be removed in 1.1.0")]
pub fn add_collider_legacy(/* ... */) { /* ... */ }
```

## Template inventaire des deprecations (obligatoire)

Cet inventaire doit vivre dans la doc plugin (propose: `packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`) et etre mis a jour a chaque PR qui introduit/modifie/supprime une deprecation.

### Table de suivi (modele)

| Symbol | Language | Kind | Deprecated since | Planned removal | Replacement | Status | Tracking issue | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Physics2DPrefabExtension.hw` | TS | property | `0.9.0` | `1.1.0` | `colliders[0].hw` | active | `#1234` | `compat + new path` |
| `add_collider_legacy` | Rust | function | `0.9.0` | `1.1.0` | `add_collider_v2` | active | `#1235` | `compat + new path` |

### Regles de mise a jour

- Toute ligne doit avoir une version `Deprecated since` et une `Planned removal`.
- `Replacement` doit pointer un symbole/document exact.
- `Status` autorises: `active`, `scheduled-removal`, `removed`.
- Lors du passage a `removed`, conserver la ligne pour l historique sur au moins 1 release mineure.

### Checklist PR deprecation

- [ ] symbole tagge dans le code (`@deprecated` ou `#[deprecated(...)]`).
- [ ] inventaire mis a jour (ligne ajoutee/modifiee/supprimee avec statut).
- [ ] tests `compat` et `new path` ajoutes/maj.
- [ ] migration doc avant/apres mise a jour.
- [ ] ticket de suppression planifie reference.

## Migration strategy

## Phase 1 - Compat active (sprints 1-5)

- supporter schema legacy mono-collider (`hw/hh/radius` top-level).
- warnings dev mode pour migration conseillee.

## Phase 2 - Deprecation guidee (sprints 6-7)

- docs avant/apres pour chaque pattern.
- flags compat explicites (`legacy*`).

## Phase 3 - Stabilisation (sprint 8 + cycle mineur)

- nouveau schema recommande par defaut.
- legacy toujours disponible pendant 1 cycle mineur.

## Migration examples obligatoires

- prefab sol simple legacy -> nouveau.
- player mono-collider -> player multi-colliders head/body/foot.
- hook collision legacy -> pull batch + hook batch optionnel.

## Release communication plan

- changelog entree par lot (Breaking/Deprecated/New/Perf).
- section upgrade notes dans release notes.
- snippets copy/paste verifies.

## Quality gates docs

- [ ] aucune API publique sans rustdoc/jsdoc.
- [ ] docs compile/check links.
- [ ] examples testes automatiquement quand possible.
- [ ] migration steps verifies sur un playground.
- [ ] tout element deprecie est tagge dans le code (Rust `#[deprecated]`, TS `@deprecated`).
- [ ] inventaire des deprecations maintenu (symbole, since, removal, remplacement).

## Definition of Done docs/migration

- [ ] README plugin lisible en 5 minutes pour demarrer.
- [ ] guide API couvre extension + imperative + helpers.
- [ ] guide migration couvre 80% cas legacy connus.
- [ ] release notes incluent impacts perf et plan d adoption.
- [ ] toutes les deprecations sont tracees et taggees dans le code associe.
