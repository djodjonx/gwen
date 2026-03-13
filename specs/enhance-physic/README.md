# Enhance Physic - Plan index

Ce dossier contient le plan complet pour faire evoluer le plugin physics2d avec priorites:

- performance maximale,
- DX irreprochable,
- calcul pousse vers Rust/WASM,
- docs/tests/perf/tree-shaking traites des le design.

## Documents

1. `00-overview.md`
2. `01-roadmap-implementation.md`
3. `02-api-dx-design.md`
4. `03-test-and-benchmark-strategy.md`
5. `04-doc-and-migration-plan.md`
6. `05-tree-shaking-and-build-plan.md`

## Ordre de lecture recommande

- lire `00` puis `02` pour alignement produit/API,
- lire `01` pour planning sprint par sprint,
- lire `03`, `04`, `05` pour gates qualite avant implementation.

## Note de contexte

Le design API prend en compte le pattern prefab actuel visible dans:

- `playground/mario-css/src/prefabs/TilePrefabs.ts`

avec une migration progressive vers `colliders[]` pour supporter proprement des cas player multi-colliders (`head/body/foot`).

