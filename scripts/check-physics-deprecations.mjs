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
const RUST_SRC_DIR = path.join(repoRoot, 'crates/gwen-plugin-physics2d/src');

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
      /@deprecated[^\n]*colliders\[].?restitution[^\n]*[\s\S]*?restitution\?: number;/m,
    migrationPattern: /`Physics2DPrefabExtension\.restitution`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.friction',
    deprecatedPattern:
      /@deprecated[^\n]*colliders\[].?friction[^\n]*[\s\S]*?friction\?: number;/m,
    migrationPattern: /`Physics2DPrefabExtension\.friction`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.isSensor',
    deprecatedPattern:
      /@deprecated[^\n]*colliders\[].?isSensor[^\n]*[\s\S]*?isSensor\?: boolean;/m,
    migrationPattern: /`Physics2DPrefabExtension\.isSensor`/,
  },
  {
    symbol: 'Physics2DPrefabExtension.density',
    deprecatedPattern:
      /@deprecated[^\n]*colliders\[].?density[^\n]*[\s\S]*?density\?: number;/m,
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

function parseMigrationInventory(migrationSource) {
  const rows = migrationSource
    .split('\n')
    .filter((line) => line.startsWith('| `') && !line.includes('| Symbol |'));

  return rows.map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    return {
      raw: line,
      symbol: cells[0]?.replaceAll('`', '') ?? '',
      language: cells[1]?.replaceAll('`', '') ?? '',
      kind: cells[2]?.replaceAll('`', '') ?? '',
      deprecatedSince: cells[3]?.replaceAll('`', '') ?? '',
      plannedRemoval: cells[4]?.replaceAll('`', '') ?? '',
      replacement: cells[5]?.replaceAll('`', '') ?? '',
      status: cells[6]?.replaceAll('`', '') ?? '',
      trackingIssue: cells[7]?.replaceAll('`', '') ?? '',
      tests: cells[8]?.replaceAll('`', '') ?? '',
    };
  });
}

async function collectRustSourceFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRustSourceFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      files.push(fullPath);
    }
  }

  return files;
}

export function runDeprecationChecks({ typesSource, migrationSource, rustSources = [] }) {
  const errors = [];
  const inventoryRows = parseMigrationInventory(migrationSource);
  const expectedSymbols = new Set(REQUIRED_TS_DEPRECATIONS.map((check) => check.symbol));
  const actualDeprecatedTagCount = (typesSource.match(/@deprecated\b/g) ?? []).length;

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

  if (actualDeprecatedTagCount !== REQUIRED_TS_DEPRECATIONS.length) {
    errors.push(
      `Deprecated TS symbol count mismatch: found ${actualDeprecatedTagCount} @deprecated tags in types.ts, expected ${REQUIRED_TS_DEPRECATIONS.length}. Update the inventory guardrail.`,
    );
  }

  const inventorySymbols = new Set(inventoryRows.map((row) => row.symbol));
  for (const symbol of expectedSymbols) {
    const row = inventoryRows.find((candidate) => candidate.symbol === symbol);
    if (!row) continue;

    if (!row.deprecatedSince || !row.plannedRemoval || !row.replacement) {
      errors.push(
        `Incomplete migration inventory metadata for ${symbol}: deprecatedSince/plannedRemoval/replacement are required.`,
      );
    }
    if (!row.trackingIssue || !row.tests) {
      errors.push(`Incomplete migration inventory metadata for ${symbol}: trackingIssue/tests are required.`);
    }
  }

  for (const symbol of inventorySymbols) {
    if (!expectedSymbols.has(symbol)) {
      errors.push(
        `Unexpected migration inventory symbol ${symbol} in packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md. Update the deprecation gate if this is intentional.`,
      );
    }
  }

  const rustDeprecations = rustSources.flatMap(({ filePath, source }) => {
    const matches = source.match(/#\[deprecated[\s\S]*?]/g) ?? [];
    return matches.map(() => filePath);
  });
  if (rustDeprecations.length > 0) {
    errors.push(
      `Rust deprecated symbols detected in ${[...new Set(rustDeprecations)].join(', ')}. Add them to the migration audit and extend the gate before merging.`,
    );
  }

  return errors;
}

export async function runDeprecationChecksFromDisk() {
  const rustFilePaths = await collectRustSourceFiles(RUST_SRC_DIR);
  const [typesSource, migrationSource, rustSources] = await Promise.all([
    fs.readFile(TYPES_FILE, 'utf8'),
    fs.readFile(MIGRATION_FILE, 'utf8'),
    Promise.all(
      rustFilePaths.map(async (filePath) => ({
        filePath: path.relative(repoRoot, filePath),
        source: await fs.readFile(filePath, 'utf8'),
      })),
    ),
  ]);

  return runDeprecationChecks({ typesSource, migrationSource, rustSources });
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
