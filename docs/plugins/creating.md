# Creating Plugins

GWEN provides a unified toolkit for authoring plugins via `@gwen/kit`. 

Instead of writing verbose classes manually, you use the `definePlugin` helper. It creates standard, type-safe plugin constructors that integrate perfectly with the engine.

## The `definePlugin` Helper

`definePlugin` is a factory function that takes a definition object and returns a **class constructor**. You can instantiate it with `new MyPlugin()` in your `gwen.config.ts`.

It elegantly handles local state by keeping it inside a `setup()` closure, so you don't need class fields or `this.` bindings.

### Basic TS-Only Plugin

Here is how you create a simple plugin:

```typescript
import { definePlugin } from '@gwen/kit';

export const LoggerPlugin = definePlugin({
  name: 'LoggerPlugin',
  
  // The setup function is called once when the plugin is instantiated.
  // It returns the lifecycle hooks for the engine.
  setup() {
    return {
      onInit(api) {
        console.log('LoggerPlugin initialized!');
      },
      onUpdate(api, dt) {
        // Runs every frame
      }
    };
  }
});
```

Usage in `gwen.config.ts`:

```typescript
import { defineConfig } from '@gwen/kit';
import { LoggerPlugin } from './plugins/LoggerPlugin';

export default defineConfig({
  plugins: [new LoggerPlugin()]
});
```

## Plugin Configuration (Options)

If your plugin needs configuration, you declare an `options` parameter in the `setup()` function. TypeScript will automatically infer the argument type for the generated constructor.

```typescript
import { definePlugin } from '@gwen/kit';

export interface AudioConfig {
  masterVolume?: number;
}

export const AudioPlugin = definePlugin({
  name: 'AudioPlugin',
  
  setup(options: AudioConfig = {}) {
    const volume = options.masterVolume ?? 0.8;
    let ctx: AudioContext;

    return {
      onInit(api) {
        ctx = new AudioContext();
        // use volume...
      },
      onDestroy() {
        ctx.close();
      }
    };
  }
});
```

Usage in `gwen.config.ts`:

```typescript
// TypeScript enforces the AudioConfig shape here:
plugins: [new AudioPlugin({ masterVolume: 0.5 })]
```

## Providing Services

Plugins can expose APIs (services) to the rest of the game (Systems, Scenes, UI). 

To do this, you declare what your plugin `provides` as a phantom type mapping, and then register the actual implementation in `onInit()`.

```typescript
import { definePlugin } from '@gwen/kit';

// 1. Define the service interface
export interface MathService {
  add(a: number, b: number): number;
}

export const MathPlugin = definePlugin({
  name: 'MathPlugin',
  
  // 2. Declare what this plugin provides
  provides: { math: {} as MathService },
  
  setup() {
    return {
      onInit(api) {
        // 3. Register the actual implementation
        api.services.register('math', {
          add: (a, b) => a + b
        });
      }
    };
  }
});
```

### Automatic Type Safety

When you register `MathPlugin` in your `gwen.config.ts` and run `gwen prepare` (or `gwen dev`), GWEN automatically updates the global `GwenServices` type.

You can then access your service anywhere in your game with zero manual typing:

```typescript
// Inside a system or scene:
const math = api.services.get('math'); // ✅ Automatically typed as MathService
console.log(math.add(2, 2));
```

## Lifecycle Hooks

The object returned by `setup()` can implement several optional lifecycle hooks:

```typescript
setup() {
  return {
    /**
     * Called once when the plugin is registered with the engine.
     * Register services, subscribe to hooks, and initialize state here.
     */
    onInit(api) {},

    /**
     * Called at the very start of each frame, before WASM steps.
     * Ideal for reading raw inputs.
     */
    onBeforeUpdate(api, dt) {},

    /**
     * Called after WASM steps — apply game logic here.
     */
    onUpdate(api, dt) {},

    /**
     * Called at the end of each frame for rendering and UI updates.
     */
    onRender(api) {},

    /**
     * Called when the engine stops or plugin is removed.
     * Free resources, close connections, etc.
     */
    onDestroy() {}
  };
}
```

## Advanced: Defining WASM Plugins

`definePlugin` also supports creating high-performance plugins powered by Rust/WASM. By simply adding a `wasm` key to the definition, the factory generates a plugin with WASM-specific lifecycles.

```typescript
import { definePlugin, loadWasmPlugin } from '@gwen/kit';

export const Physics2DPlugin = definePlugin({
  name: 'Physics2D',
  provides: { physics: {} as Physics2DAPI },
  
  // 1. Declare WASM context
  wasm: {
    id: 'physics2d',
    channels: [
      { name: 'transform', direction: 'read', strideBytes: 20, bufferType: 'f32' }
    ],
  },
  
  setup(options = {}) {
    let wasmPlugin: any = null;
    
    return {
      // 2. Initialize WASM module
      async onWasmInit(_bridge, _region, api, bus) {
        const wasm = await loadWasmPlugin({ jsUrl: '/wasm/gwen_physics2d.js' });
        wasmPlugin = new wasm.Physics2DPlugin();
        api.services.register('physics', wasmPlugin);
      },
      
      // 3. Step the WASM simulation
      onStep(dt) { 
        wasmPlugin?.step(dt); 
      },
      
      onDestroy() { 
        wasmPlugin?.free(); 
      },
    };
  },
});
```

*For more details on WASM plugins, see the Advanced section in the sidebar.*

## Typing Instance Variables

Because `definePlugin` returns a constructor value rather than a named TypeScript type, you cannot use the `const` directly as a type annotation if you need to reference the plugin instance itself in another file.

Use the `GwenPluginInstance` helper utility from `@gwen/kit`:

```typescript
import type { GwenPluginInstance } from '@gwen/kit';
import { AudioPlugin } from './AudioPlugin';

let pluginRef: GwenPluginInstance<typeof AudioPlugin>;
```

## Next Steps

- [Official Plugins](/plugins/official) - Check out the source of built-in plugins for real-world examples.
- [Systems](/core/systems) - Consume your plugin services in gameplay logic.
- [Configuration](/core/configuration) - Register your newly created plugins.