# Physics2D Enhancement - Tree shaking and build plan

## Objectif

S assurer que le package final n embarque que le code utilise par le projet consommateur.

## Principes

- exports ESM explicites et segmentes.
- modules side-effect free par defaut.
- entry points separes pour helpers optionnels.
- eviter imports globaux qui tirent toute la librairie.

## Packaging strategy proposee

## 1) Entry points clairs

- `@djodjonx/plugin-physics2d` (core minimal).
- `@djodjonx/plugin-physics2d/helpers` (helpers optionnels).
- `@djodjonx/plugin-physics2d/tilemap` (outils precompute/chunks).
- `@djodjonx/plugin-physics2d/debug` (debug overlay/stats UI).

But: un utilisateur qui ne prend que core ne paie pas helpers/tilemap/debug.

## 2) `package.json` discipline

- `exports` map explicite par entry point.
- `sideEffects: false` si vrai globalement, sinon liste precise.
- `types` par entry point.
- conserver ESM tree-shakable en priorite.

## 3) Import hygiene

- pas de barrel qui re-export tout sans besoin.
- imports internes par chemin fin.
- eviter initialisation implicite au top-level.

## 4) WASM loading strategy

- chargement lazy/explicite du module wasm.
- isoler debug/instrumentation pour ne pas polluer prod.
- feature flags build pour code debug.

## Verification plan

## Build checks (chaque release candidate)

- bundle size core seul.
- bundle size core+helpers.
- bundle size core+tilemap.
- delta max acceptable documente.

## Static checks

- script detectant imports cycliques/barrels lourds.
- script check side-effectful modules.

## Runtime checks

- pas d import debug en mode prod.
- chargement wasm mesurable et stable.

## KPI proposes

- reduction taille bundle pour usage core-only vs full package.
- zero code debug dans bundle prod par defaut.
- aucun helper non utilise present (verification par inspecteur bundle).

## Risques

- faux `sideEffects: false` sur module ayant effects.
- re-export involontaire dans index principal.

## Mitigation

- audit modules avant declaration sideEffects.
- tests smoke de runtime avec tree-shaken bundles.

## Definition of Done tree shaking

- [ ] exports map finalisee et documentee.
- [ ] verification bundle report avant/apres.
- [ ] guides imports recommandes dans docs plugin.
- [ ] tests smoke build prod sur au moins 2 scenarios d usage.

## Checklist implementation

- [ ] separer `core`, `helpers`, `tilemap`, `debug` en entry points.
- [ ] ajuster `package.json` exports/types/sideEffects.
- [ ] supprimer re-exports globaux non necessaires.
- [ ] ajouter script CI de verification taille bundle.
- [ ] documenter patterns d import tree-shakable.

