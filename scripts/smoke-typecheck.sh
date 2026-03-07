#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# GWEN Smoke Test — Type-checking du playground après gwen prepare
#
# Ce script simule le workflow utilisateur :
#   1. Exécuter `gwen prepare` pour générer `.gwen/gwen.d.ts`
#   2. Vérifier que `tsc --noEmit` passe sans erreur
#   3. Valider la structure du fichier généré
#
# Utilisé dans le CI (GitHub Actions) pour empêcher les régressions de types.
#
# Usage :
#   ./scripts/smoke-typecheck.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PLAYGROUND="playground/space-shooter"
GWEN_DTS="$PLAYGROUND/.gwen/gwen.d.ts"

echo "═══════════════════════════════════════════════════════════════"
echo "  GWEN Smoke Test — Type Inference Validation"
echo "═══════════════════════════════════════════════════════════════"

# ── Step 1 : gwen prepare ────────────────────────────────────────────────────
echo ""
echo "▸ Step 1/4 — Running gwen prepare..."
cd "$PLAYGROUND"
npx gwen prepare
echo "  ✅ gwen prepare succeeded"

# ── Step 2 : Validate generated file structure ───────────────────────────────
echo ""
echo "▸ Step 2/4 — Validating .gwen/gwen.d.ts structure..."

if [ ! -f ".gwen/gwen.d.ts" ]; then
  echo "  ❌ FAIL: .gwen/gwen.d.ts not found"
  exit 1
fi

# Must contain the GwenDefaultServices interface
grep -q "interface GwenDefaultServices" ".gwen/gwen.d.ts" || {
  echo "  ❌ FAIL: Missing 'interface GwenDefaultServices'"
  exit 1
}

# Must NOT contain a polluting index signature
if grep -q "\[key: string\]" ".gwen/gwen.d.ts"; then
  echo "  ❌ FAIL: Found polluting index signature [key: string] in gwen.d.ts"
  exit 1
fi

# Should contain direct type imports (Nuxt-like approach)
if grep -q "KeyboardInput\|AudioManager\|Physics2DAPI" ".gwen/gwen.d.ts"; then
  echo "  ✅ Direct type imports found (Nuxt-like approach active)"
else
  echo "  ⚠️  No direct type imports — using fallback inference only"
fi

echo "  ✅ .gwen/gwen.d.ts structure is valid"

# ── Step 3 : tsc --noEmit ────────────────────────────────────────────────────
echo ""
echo "▸ Step 3/4 — Running tsc --noEmit..."
npx tsc --noEmit --project tsconfig.json
echo "  ✅ tsc --noEmit passed — zero type errors"

# ── Step 4 : Check no manual annotations left ────────────────────────────────
echo ""
echo "▸ Step 4/4 — Checking for leftover manual annotations..."

LEFTOVERS=$(grep -rn "EngineAPI<GwenServices>" src/ || true)
if [ -n "$LEFTOVERS" ]; then
  echo "  ⚠️  WARNING: Found manual EngineAPI<GwenServices> annotations:"
  echo "$LEFTOVERS"
  echo "  These should be removed — inference handles typing automatically."
else
  echo "  ✅ No manual annotations found — clean codebase"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ All smoke tests passed!"
echo "═══════════════════════════════════════════════════════════════"
