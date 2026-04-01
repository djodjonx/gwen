# mario-css

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
mario-css/
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
import { defineConfig } from '@gwenengine/kit';
import { InputPlugin } from '@gwenengine/input';
import { AudioPlugin } from '@gwenengine/audio';

export default defineConfig({
  plugins: [new InputPlugin(), new AudioPlugin()],
});
```

## Docs

- [GWEN Documentation](https://gwen.dev/docs)
- [Plugin API](https://gwen.dev/docs/plugins)
- [Schema DSL](https://gwen.dev/docs/schema)
