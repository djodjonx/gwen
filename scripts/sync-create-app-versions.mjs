#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

const packageFiles = {
  GWEN_ENGINE_CORE_VERSION: 'packages/@djodjonx/engine-core/package.json',
  GWEN_KIT_VERSION: 'packages/@djodjonx/kit/package.json',
  GWEN_PLUGIN_AUDIO_VERSION: 'packages/@djodjonx/plugin-audio/package.json',
  GWEN_PLUGIN_INPUT_VERSION: 'packages/@djodjonx/plugin-input/package.json',
  GWEN_RENDERER_CANVAS2D_VERSION: 'packages/@djodjonx/renderer-canvas2d/package.json',
  GWEN_CLI_VERSION: 'packages/@djodjonx/cli/package.json',
  GWEN_VITE_PLUGIN_VERSION: 'packages/@djodjonx/vite-plugin/package.json',
};

const outFile = path.join(ROOT, 'packages/create-gwen-app/versions.json');

function readVersion(relPath) {
  const abs = path.join(ROOT, relPath);
  const pkg = JSON.parse(fs.readFileSync(abs, 'utf-8'));
  return pkg.version;
}

const versions = {};
for (const [key, relPath] of Object.entries(packageFiles)) {
  versions[key] = readVersion(relPath);
}

fs.writeFileSync(outFile, JSON.stringify(versions, null, 2) + '\n', 'utf-8');
console.log(`[sync-create-app-versions] Updated ${outFile}`);
for (const [k, v] of Object.entries(versions)) {
  console.log(`  ${k}=${v}`);
}

