import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages/@gwen');

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

async function verify() {
  console.log(`${colors.blue}🔍 Verification des packages avant publication...${colors.reset}\n`);
  
  const packages = fs.readdirSync(PACKAGES_DIR);
  let hasError = false;

  for (const pkgName of packages) {
    const pkgPath = path.join(PACKAGES_DIR, pkgName);
    const pkgJsonPath = path.join(pkgPath, 'package.json');

    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    console.log(`Checking ${colors.blue}${pkgJson.name}${colors.reset}...`);

    // 1. Verifier le dossier dist
    if (!fs.existsSync(path.join(pkgPath, 'dist'))) {
      console.error(`${colors.red}❌ Dossier "dist/" manquant dans ${pkgName}${colors.reset}`);
      hasError = true;
    }

    // 2. Verifier le WASM si specifié
    // On peut detecter si le package attend du WASM via la presence de "wasm" dans "files" 
    // ou via une meta-donnée gwen
    const needsWasm = pkgJson.files?.includes('wasm') || pkgJson.gwen?.type === 'wasm-plugin' || pkgName === 'engine-core';
    
    if (needsWasm) {
      const wasmDir = path.join(pkgPath, 'wasm');
      if (!fs.existsSync(wasmDir)) {
        console.error(`${colors.red}❌ Dossier "wasm/" manquant dans ${pkgName}${colors.reset}`);
        hasError = true;
      } else {
        const wasmFiles = fs.readdirSync(wasmDir).filter(f => f.endsWith('.wasm'));
        if (wasmFiles.length === 0) {
          console.error(`${colors.red}❌ Aucun fichier .wasm trouvé dans ${pkgName}/wasm/${colors.reset}`);
          hasError = true;
        } else {
          console.log(`${colors.green}  ✓ WASM présent (${wasmFiles.join(', ')})${colors.reset}`);
        }
      }
    }

    // 3. Verifier les dependances workspace:* (pnpm les remplace au publish, mais on verifie la cohérence)
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    for (const [name, version] of Object.entries(deps)) {
        if (version === 'workspace:*' && !name.startsWith('@djodjonx/')) {
            console.warn(`${colors.yellow}  ⚠ Dependance workspace:* suspecte : ${name}${colors.reset}`);
        }
    }
  }

  if (hasError) {
    console.error(`\n${colors.red}Critique : Certains packages ne sont pas prêts pour la publication.${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}✅ Tous les packages sont valides et prêts !${colors.reset}\n`);
  }
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
