#!/usr/bin/env node
import { readFileSync } from 'fs';

const commitMsgFile = process.argv[2];
const msg = readFileSync(commitMsgFile, 'utf-8').trim();

// Ignore merge commits and revert commits
if (msg.startsWith('Merge') || msg.startsWith('Revert')) {
  console.log('✅ Merge/Revert commit - skipping validation');
  process.exit(0);
}

// Conventional Commits pattern
// type(scope): description
const pattern = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: .{1,}/;

if (!pattern.test(msg)) {
  console.error(`
❌ Invalid commit message format!

Expected format: type(scope): description

Valid types:
  - feat:     New feature
  - fix:      Bug fix
  - docs:     Documentation changes
  - style:    Code style changes (formatting, etc.)
  - refactor: Code refactoring
  - test:     Test changes
  - chore:    Build process or tooling changes
  - perf:     Performance improvements
  - ci:       CI/CD changes
  - build:    Build system changes
  - revert:   Revert a previous commit

Examples:
  ✅ feat(engine-core): add particle system
  ✅ fix(cli): resolve import path issue
  ✅ docs: update README with examples
  ✅ refactor(plugin-audio): simplify AudioManager
  ✅ test(engine-core): add prefab tests

Your message:
${msg}

Tip: Use 'git commit --amend' to fix your commit message
`);
  process.exit(1);
}

// Check title length
const title = msg.split('\n')[0];
if (title.length > 100) {
  console.error(`
⚠️  Warning: Commit title is too long (${title.length} characters)

Recommended: Keep title under 72 characters
Maximum: 100 characters

Your title: ${title}
`);
  // Warning only, don't fail
}

console.log('✅ Commit message format valid');
process.exit(0);
