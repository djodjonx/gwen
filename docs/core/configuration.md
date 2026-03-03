# Configuration

GWEN projects are configured in a single file: `gwen.config.ts`. This is where you define engine settings and register plugins.

## Creating a Config

Use `defineConfig()` to create your configuration:

```typescript
import { defineConfig } from '@gwen/engine-core';

export default defineConfig({
  engine: {
    maxEntities: 5000,
    targetFPS: 60,
    debug: false
  },

  tsPlugins: []
});
```

## Engine Options

```typescript
engine: {
  maxEntities: number;   // Maximum entities (default: 5000)
  targetFPS: number;     // Target frame rate (default: 60)
  debug: boolean;        // Enable debug mode (default: false)
}
```

### maxEntities

Sets the maximum number of entities your game can have:

```typescript
engine: {
  maxEntities: 2000  // Good for smaller games
}
```

Adjust based on your game's needs:
- Small game (platformer, puzzle): 1000-2000
- Medium game (top-down shooter): 2000-5000
- Large game (RTS, simulation): 5000-10000+

### targetFPS

Sets the target frame rate:

```typescript
engine: {
  targetFPS: 60  // 60 FPS (standard)
}
```

Common values:
- `60` - Standard (16.67ms per frame)
- `30` - Lower-end devices
- `144` - High refresh rate displays

### debug

Enables debug features:

```typescript
engine: {
  debug: process.env.NODE_ENV === 'development'
}
```

When enabled:
- Logs engine lifecycle events
- Shows performance warnings
- Enables entity count tracking

## HTML Options

Configure the HTML document:

```typescript
html: {
  title: string;       // Page title
  background: string;  // Background color
}
```

Example:

```typescript
html: {
  title: 'My Awesome Game',
  background: '#000814'
}
```

## Registering Plugins

Plugins extend the engine with features like input, audio, rendering, etc.

```typescript
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export default defineConfig({
  tsPlugins: [
    new InputPlugin(),
    new AudioPlugin(),
    new Canvas2DRenderer({ width: 800, height: 600 })
  ]
});
```

## Real Example: Space Shooter Config

From the playground:

```typescript
import { defineConfig } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';
import { HtmlUIPlugin } from '@gwen/plugin-html-ui';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';
import { DebugPlugin } from '@gwen/plugin-debug';

export default defineConfig({
  engine: {
    maxEntities: 2_000,
    targetFPS: 60,
    debug: false,
  },

  html: {
    title: 'GWEN — Space Shooter',
    background: '#000814',
  },

  tsPlugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.7 }),
    new Canvas2DRenderer({
      width: 480,
      height: 640,
      background: '#000814',
      pixelRatio: 1,
      manualRender: true
    }),
    new HtmlUIPlugin(),
    // new DebugPlugin({ overlay: { position: 'top-right' } })
  ],
});
```

## Plugin Options

### InputPlugin

Handles keyboard, mouse, and gamepad input:

```typescript
new InputPlugin({
  // No options required
})
```

Access in systems:

```typescript
const keyboard = api.services.get('keyboard');

if (keyboard.isPressed('Space')) {
  // Jump
}
```

### AudioPlugin

Manages sound effects and music:

```typescript
new AudioPlugin({
  masterVolume: 0.7  // 0.0 - 1.0
})
```

Access in systems:

```typescript
const audio = api.services.get('audio');

audio.play('shoot');
audio.playMusic('background', { loop: true });
```

### Canvas2DRenderer

Renders to Canvas 2D:

```typescript
new Canvas2DRenderer({
  width: 800,             // Canvas width in pixels
  height: 600,            // Canvas height in pixels
  background: '#000000',  // Background color
  pixelRatio: 1,          // Device pixel ratio (1 = normal, 2 = retina)
  manualRender: false     // Manual rendering control
})
```

Access in UI:

```typescript
const { ctx } = api.services.get('renderer');

ctx.fillStyle = '#ff0000';
ctx.fillRect(0, 0, 100, 100);
```

### HtmlUIPlugin

Enables HTML/CSS UI:

```typescript
new HtmlUIPlugin({
  // No options required
})
```

Use HTML for menus:

```html
<div id="score">Score: 0</div>
```

### DebugPlugin

Shows performance overlay:

```typescript
new DebugPlugin({
  overlay: {
    position: 'top-right'  // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  },
  fpsDrop: {
    threshold: 45,  // FPS below this triggers callback
    onDrop: (fps, metrics) => {
      console.warn(`FPS drop: ${fps}`);
    }
  }
})
```

Shows:
- FPS (current / average)
- Frame time
- Entity count
- System execution times

## Environment Variables

Use environment variables for different builds:

```typescript
export default defineConfig({
  engine: {
    debug: process.env.NODE_ENV === 'development',
    maxEntities: parseInt(process.env.MAX_ENTITIES || '5000')
  },

  tsPlugins: [
    new AudioPlugin({
      masterVolume: parseFloat(process.env.VOLUME || '0.7')
    })
  ]
});
```

`.env`:

```
NODE_ENV=development
MAX_ENTITIES=2000
VOLUME=0.5
```

## Multiple Configs

For different environments:

```typescript
// gwen.config.ts
const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  engine: {
    debug: isDev,
    maxEntities: isDev ? 1000 : 5000
  },

  tsPlugins: [
    new Canvas2DRenderer({
      width: 800,
      height: 600,
      pixelRatio: isDev ? 1 : window.devicePixelRatio
    }),

    // Only in dev
    ...(isDev ? [new DebugPlugin()] : [])
  ]
});
```

## Plugin Order

Plugins are initialized in order:

```typescript
tsPlugins: [
  new InputPlugin(),      // 1st - input ready first
  new AudioPlugin(),      // 2nd
  new Canvas2DRenderer(), // 3rd
  new DebugPlugin()       // 4th - debug overlays on top
]
```

## Type-Safe Services

Service types are inferred **automatically** — no manual interface needed.

Run `gwen prepare` (or `gwen dev` / `gwen build`, which call it automatically) once after adding plugins. GWEN reads your `tsPlugins` list and writes `.gwen/gwen.d.ts` with a global `GwenServices` type available **everywhere in your project without any import**:

```typescript
// gwen.config.ts — declare your plugins
export const gwenConfig = defineConfig({
  tsPlugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.8 }),
    new Canvas2DRenderer({ width: 800, height: 600 }),
  ],
});
```

```typescript
// systems/PlayerSystem.ts — GwenServices is global, no import needed
import type { EngineAPI } from '@gwen/engine-core';

export const PlayerSystem = defineSystem({
  name: 'PlayerSystem',
  onUpdate(api: EngineAPI<GwenServices>, dt: number) {
    const keyboard = api.services.get('keyboard'); // → KeyboardInput ✅
    const audio    = api.services.get('audio');    // → AudioManager  ✅
    const renderer = api.services.get('renderer'); // → Canvas2DRenderer ✅
  }
});
```

## Hot Reload

Config changes are hot-reloaded in dev mode:

1. Edit `gwen.config.ts`
2. Save
3. Changes apply instantly (no restart needed)

## Best Practices

### 1. Use Environment Variables

```typescript
engine: {
  debug: process.env.NODE_ENV === 'development'
}
```

### 2. Register All Plugins in Config

Don't register plugins in scenes — keep them in config for consistency.

### 3. Comment Plugin Options

```typescript
new Canvas2DRenderer({
  width: 480,        // Match game design
  height: 640,       // Portrait mode
  pixelRatio: 1,     // Disable retina for pixel art
  manualRender: true // Control render timing
})
```

### 4. Keep Config Minimal

Don't put game logic in config — use scenes and systems.

## Example Configs

### Minimal Config

```typescript
import { defineConfig } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export default defineConfig({
  tsPlugins: [
    new InputPlugin(),
    new Canvas2DRenderer({ width: 800, height: 600 })
  ]
});
```

### Full-Featured Config

```typescript
import { defineConfig } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';
import { HtmlUIPlugin } from '@gwen/plugin-html-ui';
import { DebugPlugin } from '@gwen/plugin-debug';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  engine: {
    maxEntities: 5000,
    targetFPS: 60,
    debug: isDev,
  },

  html: {
    title: 'My Game',
    background: '#000000',
  },

  tsPlugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.8 }),
    new Canvas2DRenderer({
      width: 1280,
      height: 720,
      background: '#001122',
      pixelRatio: window.devicePixelRatio
    }),
    new HtmlUIPlugin(),
    ...(isDev ? [
      new DebugPlugin({ overlay: { position: 'top-right' } })
    ] : [])
  ],
});
```

## Next Steps

- [Plugins](/plugins/official) - Explore all official plugins
- [Scenes](/core/scenes) - Use config in scenes
- [Examples](/examples/space-shooter) - See complete configs

