# Physics2D Enhancement - Test and benchmark strategy

## Sprint 1 artefacts obligatoires

- type tests TS pour `Physics2DConfig` vNext et `Physics2DPrefabExtension` legacy/vNext,
- integration tests TS pour `getCollisionEventsBatch()` et le cache frame-local,
- integration minimale TS/WASM pour le handshake `PHYSICS2D_BRIDGE_SCHEMA_VERSION`,
- script CI de verification deprecations + test faux positif/faux negatif minimal,
- note perf `no-impact` ou mesure allocation avant/apres sur la lecture du buffer via typed views.

## Objectif

Garantir qu aucune feature n entre sans:

- preuve fonctionnelle,
- preuve de non-regression,
- preuve de perf.

## Test pyramid cible

- Unit tests Rust (logique simulation, filtering, grounded, event queue).
- Unit tests TS (adapters, typing, helpers, compat legacy).
- Integration tests TS+WASM (API publique de bout en bout).
- Scenario tests playground (gameplay reference).
- Benchmarks micro + macro (latence, throughput, allocations).

## Matrix de tests par lot

## Lot events batch

- Rust unit:
  - ring buffer push/pop,
  - wrap-around,
  - coalescing,
  - dropped counter.
- TS unit:
  - decode batch,
  - object pooling,
  - API pull contract.
- Integration:
  - events order contract,
  - no loss in nominal load.
- Perf:
  - throughput events/s,
  - latency frame.

## Lot layers/masks

- Rust unit:
  - collision allowed/blocked matrix.
- TS integration:
  - map layer name -> bitset,
  - runtime updates.
- Scenario:
  - playerFoot collides only with ground.

## Lot grounded

- Rust unit:
  - grounded state transitions,
  - slope/edge cases.
- Integration:
  - `getGroundState` stable sur plusieurs frames.
- Scenario:
  - jump gate correcte dans platformer.

## Lot multi-colliders

- Unit:
  - mapping collider IDs,
  - offsets,
  - sensors.
- Integration:
  - event payload contient `aColliderId/bColliderId`.
- Scenario:
  - head hits box, foot grounds, body collides walls.

## Lot tilemap chunks

- Unit:
  - bake output validity,
  - checksum/version.
- Integration:
  - load/unload chunk deterministic.
- Perf:
  - create/load scene time,
  - colliders actifs count.

## Lot presets solver/CCD

- Unit:
  - preset mapping exact.
- Integration:
  - per-body override precedence.
- Perf:
  - tunneling rate,
  - p50/p95 step time.

## KPI et seuils cibles (proposes)

- JS hot path allocations/frame: 0 (ou proche 0, stable).
- JS orchestration time: <= 0.60 ms p95 reference scene.
- physics step time (WASM): baseline + regression max 10% sans justification.
- event throughput: >= 50k/s soutenu.
- dropped events nominal: 0.
- tunnel rate (scenario rapide): < 0.1% avec preset adapte.

## Tooling propose

- Rust:
  - `cargo test`,
  - criterion (micro-bench),
  - feature flags bench.
- TS:
  - vitest/jest (selon stack existante),
  - type tests,
  - snapshots API contract (minimal).
- Playground:
  - harness script pour scenarios repetables,
  - collecte stats JSON.

## CI gates (obligatoires)

- [ ] unit tests rust pass.
- [ ] unit/integration tests ts pass.
- [ ] benchmark smoke pass (seuils minimaux).
- [ ] docs references API non cassees.
- [ ] rapport perf mis a jour pour lots impactants.
- [ ] verification deprecations: tout symbole legacy est tagge (`@deprecated` TS ou `#[deprecated(...)]` Rust).
- [ ] verification inventaire: la table deprecations migration est synchronisee avec les symboles deprecies.
- [ ] pour Sprint 1: le bridge TS/WASM refuse explicitement un mismatch de version.

## Reporting standard pour chaque PR

1. Scope et hypotheses.
2. Resultats tests (unit/integration).
3. Resultats perf (avant/apres).
4. Impact DX (API, docs, migration).
5. Risques restants et follow-up.
6. Etat deprecations (symboles ajoutes/supprimes, versions `since/removal`, lien inventaire).

## Definition of Done tests/perf

- [ ] chaque nouvelle fonctionnalite a tests unitaires associes.
- [ ] chaque changement runtime significatif a bench associe.
- [ ] au moins 1 scenario gameplay de non-regression mis a jour.
- [ ] artefacts perf archives (csv/json/md).
- [ ] tests de compat legacy maintenus tant qu une deprecation est active.
