# Physics2D Agent Runbook

Ce runbook donne un ordre d execution strict pour implementer le backlog `PHYS-S*` avec gates de qualite, perf et DX.

## Regles globales (toujours actives)

- Pull-first: utiliser `getCollisionEventsBatch` comme voie principale.
- Hooks: uniquement opt-in et hors hot path.
- Bridge: pas de JSON sur hot path, utiliser des vues typées sur `wasm.memory.buffer`.
- Deprecations: tag obligatoire dans le code (`@deprecated` TS/JSDoc, `#[deprecated(...)]` Rust).
- Inventaire deprecations: mise a jour obligatoire dans `packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`.
- Toute tache runtime doit fournir un resultat perf (ou un no-impact justifie).

## Stop/Go global avant merge

- [ ] Unit tests Rust passes
- [ ] Unit/integration TS passes
- [ ] Bench impacte mis a jour
- [ ] rustdoc/jsdoc ajoutes sur symboles publics modifies
- [ ] docs plugin synchronisees
- [ ] gate deprecation verte

## Sprint 1 - Contract and bridge

### Ordre de taches

1. `PHYS-S1-001`
2. `PHYS-S1-002`
3. `PHYS-S1-003`
4. `PHYS-S1-006`
5. `PHYS-S1-004`
6. `PHYS-S1-007`
7. `PHYS-S1-005`

### Stop/Go Sprint 1

- [ ] Contrat `Physics2DConfig` stabilise sans casse compile existante
- [ ] Schema `extensions.physics` supporte legacy + nouveau
- [ ] Bridge zero-copy valide sur typed views
- [ ] Pull model documente first-class
- [ ] CI deprecation gate active

## Sprint 2 - Event pipeline

### Ordre de taches

1. `PHYS-S2-001`
2. `PHYS-S2-008`
3. `PHYS-S2-002`
4. `PHYS-S2-007`
5. `PHYS-S2-003`
6. `PHYS-S2-005`
7. `PHYS-S2-004`
8. `PHYS-S2-006`

### Stop/Go Sprint 2

- [ ] Overflow policy implementee (resize borne + backpressure)
- [ ] Canal critique gameplay protege
- [ ] API batch pull stable
- [ ] Pooling TS actif
- [ ] Rapport perf events archive (throughput, dropped, p95)

## Sprint 3 - Layers and masks

### Ordre de taches

1. `PHYS-S3-001`
2. `PHYS-S3-002`
3. `PHYS-S3-006`
4. `PHYS-S3-003`
5. `PHYS-S3-004`
6. `PHYS-S3-005`

### Stop/Go Sprint 3

- [ ] Filtering bitset valide cote Rust
- [ ] Mapping layers TS robuste
- [ ] Erreur DX claire si depassement limite layers
- [ ] Scenarios playground passes

## Sprint 4 - Sensors natifs et grounded derive

### Ordre de taches

1. `PHYS-S4-001`
2. `PHYS-S4-002`
3. `PHYS-S4-003`
4. `PHYS-S4-004`
5. `PHYS-S4-005`
6. `PHYS-S4-006`

### Stop/Go Sprint 4

- [ ] Coeur Rust reste agnostique (pas de logique gameplay hardcodee)
- [ ] API sensors stable
- [ ] Helper grounded platformer fonctionnel
- [ ] Non-regression mario validee

## Sprint 5 - Multi-colliders prefab

### Ordre de taches

1. `PHYS-S5-001`
2. `PHYS-S5-002`
3. `PHYS-S5-003`
4. `PHYS-S5-004`
5. `PHYS-S5-006`
6. `PHYS-S5-005`

### Stop/Go Sprint 5

- [ ] `colliders[]` pleinement supporte
- [ ] IDs de collider propages dans events
- [ ] Compat legacy uniquement cote TS
- [ ] Rust single-path multi-colliders confirme

## Sprint 6 - Tilemap chunks and materials

### Ordre de taches

1. `PHYS-S6-001`
2. `PHYS-S6-002`
3. `PHYS-S6-006`
4. `PHYS-S6-003`
5. `PHYS-S6-004`
6. `PHYS-S6-005`

### Stop/Go Sprint 6

- [ ] Build chunks versionne
- [ ] Load/unload runtime deterministic
- [ ] Patch incremental chunk operationnel
- [ ] Bench patch vs rebake archive
- [ ] Docs tilemap/migration a jour

## Sprint 7 - Solver and CCD presets

### Ordre de taches

1. `PHYS-S7-001`
2. `PHYS-S7-002`
3. `PHYS-S7-003`
4. `PHYS-S7-004`
5. `PHYS-S7-006`
6. `PHYS-S7-005`

### Stop/Go Sprint 7

- [ ] Presets qualite valides et documentes
- [ ] CCD global + per-body verify
- [ ] Bench comparatifs publies
- [ ] Outils observabilite disponibles en debug (sans impact prod)

## Sprint 8 - Hardening and release

### Ordre de taches

1. `PHYS-S8-001`
2. `PHYS-S8-002`
3. `PHYS-S8-003`
4. `PHYS-S8-007`
5. `PHYS-S8-004`
6. `PHYS-S8-005`
7. `PHYS-S8-006`

### Stop/Go Sprint 8

- [ ] Audit deprecations complet et propre
- [ ] Tree-shaking verifie sur bundles cibles
- [ ] E2E playgrounds stables
- [ ] Perf Score CI bloqueur en place
- [ ] Docs/release notes finalisees

## Parallelisation recommandee

- Rust hot path et TS typing peuvent avancer en parallele si contrat fichier `types.ts` est gele.
- Docs peuvent avancer en flux continu, mais valider snippets uniquement apres merge de la tache liee.
- Bench tooling peut etre factorise des S2 et reutilise en S6/S7/S8.

## Mode d escalation (si blocage)

- Blocage contrat API: ouvrir ADR court et geler les nouvelles options jusqu a decision.
- Blocage perf: prioriser reduction allocations et simplification du chemin critique.
- Blocage migration: maintenir compat via adaptateur TS, ne jamais complexifier Rust legacy.

## Checklist finale pre-release

- [ ] Tous les IDs S1..S8 clotures ou explicitement deferres
- [ ] Aucune deprecation non taggee
- [ ] Inventaire migration a jour
- [ ] KPI perf compares aux objectifs du plan
- [ ] Documentation plugin complete et navigable

