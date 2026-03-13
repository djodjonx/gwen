import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const TYPES_FILE = path.join(
  repoRoot,
  'packages/@djodjonx/plugin-physics2d/src/types.ts',
);
const MIGRATION_FILE = path.join(
  repoRoot,
  'packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md',
);

const REQUIRED_TS_DEPRECATIONS = [
  {
    symbol: 'Physics2DPrefabExtension.radius',
    deprecatedPattern:
      /@deprecated[^\n]*colliders\[0].radius[^\n]*[\s\S]*?radius\?: number;/m,
    migrationPattern: /`Physics2DPrefabExtension\.radius`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.hw',
    deprecatedPattern: /@deprecated[^\n]*colliders\[0].hw[^\n]*[\s\S]*?hw\?: number;/m,
    migrationPattern: /`Physics2DPrefabExtension\.hw`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.hh',
    deprecatedPattern: /@deprecated[^\n]*colliders\[0].hh[^\n]*[\s\S]*?hh\?: number;/m,
    migrationPattern: /`Physics2DPrefabExtension\.hh`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.restitution',
    deprecatedPattern:
      /@deprecated[^\n]*colliders\[\].?restitution[^\n]*[\s\S]*?restitution\?: number;/m,
    migrationPattern: /`Physics2DPrefabExtension\.restitution`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.friction',
    deprecatedPattern:
      /@deprecated[^\n]*colliders\[\].?friction[^\n]*[\s\S]*?friction\?: number;/m,
    migrationPattern: /`Physics2DPrefabExtension\.friction`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.isSensor',
    deprecatedPattern:
      /@deprecated[^\n]*colliders\[\].?isSensor[^\n]*[\s\S]*?isSensor\?: boolean;/m,
    migrationPattern: /`Physics2DPrefabExtension\.isSensor`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.density',
    deprecatedPattern:
      /@deprecated[^\n]*colliders\[\].?density[^\n]*[\s\S]*?density\?: number;/m,
    migrationPattern: /`Physics2DPrefabExtension\.density`/,
  },
  {
    symbol: 'parseCollisionEvents',
    deprecatedPattern:
      /@deprecated[^\n]*readCollisionEventsFromBuffer[^\n]*[\s\S]*?export function parseCollisionEvents\(/m,
    migrationPattern: /`parseCollisionEvents`/,
  },
  {
    symbol: 'Physics2DAPI.getCollisionEvents',
    deprecatedPattern:
      /@deprecated[^\n]*getCollisionEventsBatch\(\)[^\n]*[\s\S]*?getCollisionEvents\(\): CollisionEvent\[];/m,
    migrationPattern: /`Physics2DAPI\.getCollisionEvents`/,
  },
];

export function runDeprecationChecks({ typesSource, migrationSource }) {
  const errors = [];

  for (const check of REQUIRED_TS_DEPRECATIONS) {
    if (!check.deprecatedPattern.test(typesSource)) {
      errors.push(
        `Missing or malformed @deprecated tag for ${check.symbol} in packages/@djodjonx/plugin-physics2d/src/types.ts`,
      );
    }

    if (!check.migrationPattern.test(migrationSource)) {
      errors.push(
        `Missing migration inventory entry for ${check.symbol} in packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`,
      );
    }
  }

  return errors;
}

export async function runDeprecationChecksFromDisk() {
  const [typesSource, migrationSource] = await Promise.all([
    fs.readFile(TYPES_FILE, 'utf8'),
    fs.readFile(MIGRATION_FILE, 'utf8'),
  ]);

  return runDeprecationChecks({ typesSource, migrationSource });
}

async function main() {
  const errors = await runDeprecationChecksFromDisk();
  if (errors.length > 0) {
    console.error('❌ Physics2D deprecation gate failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ Physics2D deprecation gate passed (${REQUIRED_TS_DEPRECATIONS.length} symbols checked).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
