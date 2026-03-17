# playground-platformer-kit-css

Platformer CSS playground using `@djodjonx/gwen-kit-platformer` with merged static colliders.

## Getting started

```bash
npm install
npm run dev      # development server with WASM hot-reload
npm run build    # production build → dist/
npm run preview  # preview production build
```

## Project structure

```
playground-platformer-kit-css/
  src/
    scenes/
      PlatformerScene.ts # Kit scene + player prefab + static geometry helper
    ui/
      GameUI.ts          # CSS UI renderers (player, blocks, HUD)
  gwen.config.ts         # Engine & plugin configuration
```

## Adding plugins

```typescript
// gwen.config.ts
import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';

export default defineConfig({
  plugins: [new InputPlugin(), new AudioPlugin()],
});
```

## Docs

- [GWEN Documentation](https://gwen.dev/docs)
- [Plugin API](https://gwen.dev/docs/plugins)
- [Schema DSL](https://gwen.dev/docs/schema)
