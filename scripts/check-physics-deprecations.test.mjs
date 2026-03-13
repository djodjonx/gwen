import assert from 'node:assert/strict';

import { runDeprecationChecks } from './check-physics-deprecations.mjs';

const validTypesSource = `
interface Physics2DPrefabExtension {
  /** @deprecated Since 0.4.0. Use \`colliders[0].radius\`. Removal planned in 1.0.0. */
  radius?: number;
  /** @deprecated Since 0.4.0. Use \`colliders[0].hw\`. Removal planned in 1.0.0. */
  hw?: number;
  /** @deprecated Since 0.4.0. Use \`colliders[0].hh\`. Removal planned in 1.0.0. */
  hh?: number;
  /** @deprecated Since 0.4.0. Use \`colliders[].restitution\`. Removal planned in 1.0.0. */
  restitution?: number;
  /** @deprecated Since 0.4.0. Use \`colliders[].friction\`. Removal planned in 1.0.0. */
  friction?: number;
  /** @deprecated Since 0.4.0. Use \`colliders[].isSensor\`. Removal planned in 1.0.0. */
  isSensor?: boolean;
  /** @deprecated Since 0.4.0. Use \`colliders[].density\`. Removal planned in 1.0.0. */
  density?: number;
}
/** @deprecated Since 0.4.0. Use \`readCollisionEventsFromBuffer\`. Removal planned in 1.0.0. */
export function parseCollisionEvents() {}
interface Physics2DAPI {
  /** @deprecated Since 0.4.0. Use \`getCollisionEventsBatch()\` instead. Removal planned in 1.0.0. */
  getCollisionEvents(): CollisionEvent[];
}
`;

const validMigrationSource = `
| Symbol | Language | Kind | Deprecated since | Planned removal | Replacement | Status | Tracking issue | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| \`Physics2DPrefabExtension.radius\` | TS | property | \`0.4.0\` | \`1.0.0\` | \`colliders[0].radius\` | active | \`PHYS-S1-002\` | \`compat + new path\` |
| \`Physics2DPrefabExtension.hw\` | TS | property | \`0.4.0\` | \`1.0.0\` | \`colliders[0].hw\` | active | \`PHYS-S1-002\` | \`compat + new path\` |
| \`Physics2DPrefabExtension.hh\` | TS | property | \`0.4.0\` | \`1.0.0\` | \`colliders[0].hh\` | active | \`PHYS-S1-002\` | \`compat + new path\` |
| \`Physics2DPrefabExtension.restitution\` | TS | property | \`0.4.0\` | \`1.0.0\` | \`colliders[].restitution\` | active | \`PHYS-S1-002\` | \`compat + new path\` |
| \`Physics2DPrefabExtension.friction\` | TS | property | \`0.4.0\` | \`1.0.0\` | \`colliders[].friction\` | active | \`PHYS-S1-002\` | \`compat + new path\` |
| \`Physics2DPrefabExtension.isSensor\` | TS | property | \`0.4.0\` | \`1.0.0\` | \`colliders[].isSensor\` | active | \`PHYS-S1-002\` | \`compat + new path\` |
| \`Physics2DPrefabExtension.density\` | TS | property | \`0.4.0\` | \`1.0.0\` | \`colliders[].density\` | active | \`PHYS-S1-002\` | \`compat + new path\` |
| \`parseCollisionEvents\` | TS | function | \`0.4.0\` | \`1.0.0\` | \`readCollisionEventsFromBuffer\` | active | \`PHYS-S1-003\` | \`compat + new path\` |
| \`Physics2DAPI.getCollisionEvents\` | TS | method | \`0.4.0\` | \`1.0.0\` | \`getCollisionEventsBatch\` | active | \`PHYS-S1-007\` | \`compat + new path\` |
`;

assert.deepEqual(
  runDeprecationChecks({
    typesSource: validTypesSource,
    migrationSource: validMigrationSource,
    rustSources: [],
  }),
  [],
  'expected valid fixtures to pass the deprecation gate',
);

const missingTagErrors = runDeprecationChecks({
  typesSource: validTypesSource.replace('@deprecated Since 0.4.0. Use `colliders[0].hw`. Removal planned in 1.0.0. ', ''),
  migrationSource: validMigrationSource,
});
assert.equal(missingTagErrors.some((error) => error.includes('Physics2DPrefabExtension.hw')), true);

const missingInventoryErrors = runDeprecationChecks({
  typesSource: validTypesSource,
  migrationSource: validMigrationSource.replace('| `parseCollisionEvents` | TS | function | `0.4.0` | `1.0.0` | `readCollisionEventsFromBuffer` | active | `PHYS-S1-003` | `compat + new path` |\n', ''),
});
assert.equal(missingInventoryErrors.some((error) => error.includes('parseCollisionEvents')), true);

const mismatchedCountErrors = runDeprecationChecks({
  typesSource: `${validTypesSource}\n/** @deprecated Since 0.5.0. */\nconst extra = 1;`,
  migrationSource: validMigrationSource,
  rustSources: [],
});
assert.equal(
  mismatchedCountErrors.some((error) => error.includes('Deprecated TS symbol count mismatch')),
  true,
);

const incompleteMetadataErrors = runDeprecationChecks({
  typesSource: validTypesSource,
  migrationSource: validMigrationSource.replace('`PHYS-S1-003`', '``'),
  rustSources: [],
});
assert.equal(
  incompleteMetadataErrors.some((error) => error.includes('trackingIssue/tests are required')),
  true,
);

const rustDeprecationErrors = runDeprecationChecks({
  typesSource: validTypesSource,
  migrationSource: validMigrationSource,
  rustSources: [{ filePath: 'crates/gwen-plugin-physics2d/src/example.rs', source: '#[deprecated(note = "legacy")]\npub fn old() {}' }],
});
assert.equal(
  rustDeprecationErrors.some((error) => error.includes('Rust deprecated symbols detected')),
  true,
);

console.log('✅ check-physics-deprecations.test.mjs passed');

