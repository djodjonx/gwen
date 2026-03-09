# 🚀 Guide Rapide : Première Release npm

## Prérequis (à faire une seule fois)

```bash
# 1. Installer wasm-pack
cargo install wasm-pack

# 2. Se connecter à npm
npm login

# 3. (Optionnel) Configurer GitHub Actions
# Créer un token npm : https://www.npmjs.com/settings/YOUR_USERNAME/tokens
# Ajouter dans GitHub : Settings → Secrets → Actions
# Nom: NPM_TOKEN, Valeur: votre token
```

## Workflow de Release (3 étapes)

### 1. Créer un changeset (après chaque modification)

```bash
pnpm changeset
# → Sélectionnez les packages modifiés (Espace)
# → Choisissez le type : patch/minor/major
# → Écrivez un résumé

git add .changeset/*.md
git commit -m "chore: add changeset"
git push
```

### 2. Bump les versions (quand vous êtes prêt)

```bash
pnpm changeset:version
# → Met à jour package.json
# → Génère les CHANGELOG.md

git add -A
git commit -m "chore: version packages"
git push
```

### 3. Publier sur npm

```bash
# Build WASM + TypeScript
./scripts/build-wasm.sh
pnpm build:ts

# Publier
pnpm publish -r --access public

# Créer le tag git
git tag v0.1.0
git push origin v0.1.0
```

## Ou laissez GitHub Actions le faire automatiquement

Une fois le token `NPM_TOKEN` configuré dans GitHub :

1. Push sur `main` → CI crée un PR "Version Packages"
2. Merge le PR → CI publie automatiquement sur npm

## Résumé des fichiers utiles créés

| Fichier | Usage |
|---------|-------|
| `scripts/build-wasm.sh` | **Build WASM** (essentiel avant publish) |
| `docs/DEPLOYMENT.md` | Guide pour vos utilisateurs (headers HTTP) |
| `.github/workflows/release.yml` | CI/CD automatique (optionnel) |

## Commandes de référence

```bash
# Development
pnpm dev                    # Dev mode avec watch
pnpm test                   # Tests
pnpm lint                   # Linter

# Build
./scripts/build-wasm.sh     # Build Rust → WASM
pnpm build:ts               # Build TypeScript

# Release (via Changesets)
pnpm changeset              # Créer un changeset
pnpm changeset:version      # Bump versions
pnpm release                # Publish to npm
```

## Aide

- Documentation complète : [`RELEASE.md`](../RELEASE.md)
- Configuration Changesets : [`.changeset/README.md`](../.changeset/README.md)
- Déploiement utilisateurs : [`docs/DEPLOYMENT.md`](DEPLOYMENT.md)

---

**C'est tout ! 🎉**

La prochaine fois que vous ajoutez une feature :
```bash
# 1. Codez
# 2. pnpm changeset
# 3. git commit && push
# 4. Quand prêt : pnpm changeset:version
# 5. ./scripts/build-wasm.sh && pnpm build:ts && pnpm release
```

