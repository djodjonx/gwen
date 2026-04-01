#!/usr/bin/env bash
set -euo pipefail

echo "=== RFC-000 Verification ==="

# 1. No @djodjonx references remain
OLD_REFS=$(grep -rn "@djodjonx" packages/ --include="*.ts" --include="*.json" 2>/dev/null || true)
[ -z "$OLD_REFS" ] || { echo "FAIL: @djodjonx references remain:"; echo "$OLD_REFS"; exit 1; }
echo "PASS: no @djodjonx references"

# 2. pnpm install succeeds
pnpm install --frozen-lockfile
echo "PASS: pnpm install"

# 3. TypeScript build
pnpm tsc --build --clean && pnpm tsc --build
echo "PASS: TypeScript build"

# 4. Required files per package
for dir in packages/*/; do
  for f in package.json tsconfig.json README.md src/index.ts; do
    [ -f "${dir}${f}" ] || { echo "FAIL: ${dir}${f} missing"; exit 1; }
  done
done
echo "PASS: required files present"

# 5. All tests
pnpm -r test
echo "PASS: all tests"

echo "=== RFC-000 COMPLETE ==="

