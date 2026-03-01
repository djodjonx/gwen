#!/usr/bin/env node
/**
 * create-gwen-app — CLI de scaffolding GWEN
 *
 * Usage :
 *   npm create gwen-app mon-jeu
 *   npx create-gwen-app mon-jeu
 *   pnpm create gwen-app mon-jeu
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// ── Couleurs ANSI ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
};

function log(msg) { process.stdout.write(msg + '\n'); }
function success(msg) { log(`${c.green}✅ ${msg}${c.reset}`); }
function info(msg) { log(`${c.cyan}   ${msg}${c.reset}`); }
function warn(msg) { log(`${c.yellow}⚠  ${msg}${c.reset}`); }
function title(msg) { log(`\n${c.bold}${c.cyan}${msg}${c.reset}`); }

// ── Utilitaires ───────────────────────────────────────────────────────────────

/**
 * Copie récursive d'un dossier template vers la destination.
 * Les fichiers `.template` sont copiés en remplaçant `{{PROJECT_NAME}}`.
 */
function copyTemplate(src, dest, vars) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    // _gitignore → .gitignore (npm strips .gitignore from published packages)
    const destName = entry.name.startsWith('_') ? '.' + entry.name.slice(1) : entry.name;
    const destPath = path.join(dest, destName);

    if (entry.isDirectory()) {
      copyTemplate(srcPath, destPath, vars);
    } else {
      let content = fs.readFileSync(srcPath, 'utf-8');
      for (const [key, value] of Object.entries(vars)) {
        content = content.replaceAll(`{{${key}}}`, value);
      }
      fs.writeFileSync(destPath, content, 'utf-8');
    }
  }
}

function detectPackageManager() {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  return 'npm';
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  title('🎮 create-gwen-app — GWEN Game Engine Scaffold');
  log('');

  // 1. Nom du projet (arg CLI ou prompt)
  let projectName = process.argv[2];
  if (!projectName) {
    projectName = await ask(`${c.bold}Project name:${c.reset} `);
  }
  if (!projectName || projectName.trim() === '') {
    log(`${c.yellow}No project name provided. Exiting.${c.reset}`);
    process.exit(1);
  }

  // Sanitiser : kebab-case, minuscules
  const safeName = projectName.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '');
  const destDir = path.resolve(process.cwd(), safeName);

  if (fs.existsSync(destDir)) {
    warn(`Directory "${safeName}" already exists.`);
    const overwrite = await ask(`Overwrite? (y/N) `);
    if (!overwrite.toLowerCase().startsWith('y')) {
      log('Aborted.');
      process.exit(0);
    }
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  // 2. Choix du template (pour l'instant : default uniquement)
  const templateDir = path.join(TEMPLATES_DIR, 'default');
  if (!fs.existsSync(templateDir)) {
    log(`${c.yellow}Template not found at ${templateDir}${c.reset}`);
    process.exit(1);
  }

  // 3. Copie du template
  log(`\nScaffolding ${c.bold}${safeName}${c.reset}...`);
  copyTemplate(templateDir, destDir, {
    PROJECT_NAME: safeName,
    GWEN_VERSION: '0.1.0',
  });

  success(`Project created at ./${safeName}/`);

  // 4. Instructions post-scaffold
  const pm = detectPackageManager();
  const runCmd = pm === 'npm' ? 'npm run' : pm;

  log('');
  title('📦 Next steps:');
  info(`cd ${safeName}`);
  info(`${pm} install`);
  info(`${runCmd} dev`);
  log('');
  log(`${c.dim}Docs : https://gwen.dev${c.reset}`);
  log('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

