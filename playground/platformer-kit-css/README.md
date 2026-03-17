# platformer-kit-css playground

Clean platformer playground that uses `@djodjonx/gwen-kit-platformer` as the primary gameplay layer.

## Getting started

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

## Why this playground exists

- Build a platformer scene in a few lines with kit factories.
- Keep codebase organization strict but minimal for onboarding.
- Demonstrate proper `HtmlUIPlugin` usage with HTML templates + CSS assets.

## Structure

```
playground/platformer-kit-css/
  src/
    components/
      BlockVisual.ts
      PlayerTag.ts
    level/
      levelData.ts
    prefabs/
      PlayerPrefab.ts
      BlockPrefab.ts
      HudPrefab.ts
      SceneChromePrefab.ts
    scenes/
      PlatformerScene.ts
    ui/
      BlockUI.ts
      HudUI.ts
      PlayerUI.ts
      SceneChromeUI.ts
      templates/
      styles/
  gwen.config.ts
```

## Scene setup (few lines)

`src/scenes/PlatformerScene.ts` keeps scene composition short and readable:

```ts
export const PlatformerScene = createPlatformerScene({
  name: 'PlatformerScene',
  units: 'pixels',
  gravity: 35,
  ui: [SceneChromeUI, PlayerUI, BlockUI, HudUI],
  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(BlockPrefab);
    api.prefabs.register(HudPrefab);
    api.prefabs.register(SceneChromePrefab);

    api.prefabs.instantiate('SceneChrome', 0, 0);
    api.prefabs.instantiate('Hud', 0, 0);

    for (const block of LEVEL_BLOCKS) {
      api.prefabs.instantiate('Block', block.x, block.y, block.w, block.h);
    }

    api.prefabs.instantiate('Player', PLAYER_SPAWN.x, PLAYER_SPAWN.y);
  },
  onExit() {
    world?.unload();
  },
});
```

## Notes

- Physics colliders are generated through kit helper `createPlatformerStaticGeometry`.
- Player behavior is configured via `createPlayerPrefab` (coyote, buffer, hysteresis tuning).
- UI rendering uses `HtmlUIPlugin` service (`mount`, `el`, `text`, `unmount`) only.
- Services are inferred from generated GWEN types: do not use manual casts like `as Physics2DAPI`.

## Useful commands

```bash
pnpm typecheck
pnpm lint
```

## References

- `docs/plugins/kit-platformer.md`
- `docs/plugins/kit-platformer-advanced.md`
