# Space Shooter 2

`space-shooter-2` is a copy of the original Space Shooter playground using the sprite animation plugin.

## What changed

- Added `@gwenjs/sprite-anim` in `gwen.config.ts`.
- Converted player, enemy, and bullet rendering to `extensions.spriteAnim` + `animator.draw(...)`.
- Wired gameplay systems to animation controller parameters/triggers:
  - `moving` (player movement)
  - `shoot` (player and enemy firing)
- Added simple SVG sprite assets in `public/sprites/`.

## Run

```bash
pnpm --filter @playground/space-shooter-2 dev
```

## Build

```bash
pnpm --filter @playground/space-shooter-2 build
pnpm --filter @playground/space-shooter-2 preview
```

