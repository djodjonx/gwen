# Physics2D release QA checklist

## Scope

This checklist is used for the hardening/release phase of `@djodjonx/gwen-plugin-physics2d`.

## Functional checks

- [ ] TypeScript API check (`pnpm --filter @djodjonx/gwen-plugin-physics2d typecheck`)
- [ ] TS tests pass (`pnpm --filter @djodjonx/gwen-plugin-physics2d test`)
- [ ] Rust tests pass (`cargo test -p gwen-plugin-physics2d --lib --tests`)
- [ ] Bridge schema compatibility check covered by tests

## Compatibility checks

- [ ] Deprecation gate passes (`pnpm test:deprecations`)
- [ ] Migration inventory in `docs/MIGRATION.md` is synchronized with code
- [ ] Legacy paths still covered by tests while deprecations are active

## Performance checks

- [ ] Solver benchmark smoke passes (`pnpm test:bench:physics:solver`)
- [ ] Tilemap benchmark smoke passes (`pnpm test:bench:physics:tilemap`)
- [ ] Perf score gate passes (`pnpm test:bench:physics:score`)
- [ ] Tree-shaking smoke passes (`pnpm test:bench:physics:tree-shaking`)

## Playground/e2e checks

- [ ] Playground e2e smoke passes (`pnpm test:e2e:physics:playgrounds`)
- [ ] No major gameplay/perf regression versus baseline

## Packaging and docs checks

- [ ] Package exports map includes `core/helpers/tilemap/debug`
- [ ] `sideEffects` is set correctly for tree-shaking
- [ ] README quick start and config options are up-to-date
- [ ] `CHANGELOG.md` updated with New/Deprecated/Performance/Breaking sections

## Sign-off

- [ ] QA completed by:
- [ ] Date:
- [ ] Notes / exceptions:

