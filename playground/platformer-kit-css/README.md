# playground-platformer-kit-css

A game built with [GWEN](https://gwen.dev) — the modular web-native game engine.

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
      MainScene.ts       # Your first scene
    components/          # Component definitions (typed via Schema DSL)
    systems/             # Game systems (physics, AI, ...)
    prefabs/             # Entity prefabs
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
