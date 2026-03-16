# @djodjonx/gwen-plugin-physics2d

## 1.0.0

### Minor Changes

- enhance cli, add new kit tansformer.

### Patch Changes

- Updated dependencies: [object Object], [object Object]

## Unreleased (Sprint 8 hardening)

### New

- tree-shakable subpath entry points: `core`, `helpers`, `tilemap`, `debug`
- solver/CCD benchmark harness + report (`Sprint 7` archive)
- perf score regression gate scripts for CI-style checks

### Deprecated

- legacy prefab top-level collider fields stay supported with migration path to `colliders[]`
- legacy `getCollisionEvents()` remains available, replacement is `getCollisionEventsBatch()`

### Performance

- fixed collision activation for `dynamic <-> fixed` bodies (`DYNAMIC_FIXED`) in runtime world
- added repeatable perf score based on solver and tilemap benches

### Breaking

- none in this hardening cycle

### QA checklist

- [x] unit/integration TS tests pass
- [x] Rust tests pass
- [x] deprecation gate passes (`check-physics-deprecations`)
- [x] tree-shaking smoke passes (`check-physics-tree-shaking`)
- [x] perf score regression gate passes (`check-physics-perf-score`)
- [x] playground e2e smoke passes (`check-physics-playgrounds-e2e`)

---

## 0.3.7

### Patch Changes

- new plugin and updates
- Updated dependencies: [object Object], [object Object]

## 0.3.6

### Patch Changes

- fix wasm loading
- Updated dependencies: [object Object], [object Object]

## 0.3.5

### Patch Changes

- fix published packages
- Updated dependencies: [object Object], [object Object]

## 0.3.4

### Patch Changes

- fix issue with old @gwen
- Updated dependencies: [object Object], [object Object]

## 0.3.3

### Patch Changes

- fix wasm not publish
- Updated dependencies: [object Object], [object Object]

## 0.3.2

### Patch Changes

- fix packages versions
- Updated dependencies: [object Object], [object Object]

## 0.3.1

### Patch Changes

- fix release.
- Updated dependencies: [object Object], [object Object]

## 0.2.1

### Patch Changes

- First Gwen release
- Updated dependencies: [object Object], [object Object]
