# Creating Plugins

GWEN provides a unified toolkit for authoring plugins via `@djodjonx/gwen-kit`.

Instead of writing verbose classes manually, you use `definePlugin`. It returns standard, type-safe plugin constructors that integrate with the engine.

## The `definePlugin` Helper

`definePlugin` now uses a **factory-only** API:

```typescript
const MyPlugin = definePlugin((options?) => ({
  name: 'MyPlugin',
  onInit(api) {},
}));
```

The factory runs per plugin instance (`new MyPlugin(...)`) and can keep local closure state.

### Basic TS-Only Plugin

```typescript
import { definePlugin } from '@djodjonx/gwen-kit';

export const LoggerPlugin = definePlugin(() => {
  let frames = 0;

  return {
    name: 'LoggerPlugin',
    onInit() {
      console.log('LoggerPlugin initialized!');
    },
    onUpdate(_api, _dt) {
      frames++;
    },
  };
});
```

Usage in `gwen.config.ts`:

```typescript
import { defineConfig } from '@djodjonx/gwen-kit';
import { LoggerPlugin } from './plugins/LoggerPlugin';

export default defineConfig({
  plugins: [new LoggerPlugin()],
});
```

## Plugin Configuration (Options)

If your plugin needs configuration, type the factory parameter. The constructor type is inferred automatically.

```typescript
import { definePlugin } from '@djodjonx/gwen-kit';

export interface AudioConfig {
  masterVolume?: number;
}

export const AudioPlugin = definePlugin((options: AudioConfig = {}) => {
  const volume = options.masterVolume ?? 0.8;
  let ctx: AudioContext;

  return {
    name: 'AudioPlugin',
    onInit() {
      ctx = new AudioContext();
      void volume;
    },
    onDestroy() {
      ctx.close();
    },
  };
});
```

Usage in `gwen.config.ts`:

```typescript
plugins: [new AudioPlugin({ masterVolume: 0.5 })]
```

## Providing Services

Plugins can expose APIs (services) to the rest of the game (Systems, Scenes, UI).

```typescript
import { definePlugin } from '@djodjonx/gwen-kit';

export interface MathService {
  add(a: number, b: number): number;
}

export const MathPlugin = definePlugin(() => ({
  name: 'MathPlugin',
  provides: { math: {} as MathService },
  onInit(api) {
    api.services.register('math', {
      add: (a, b) => a + b,
    });
  },
}));
```

### Automatic Type Safety

When you register `MathPlugin` and run `gwen prepare` (or `gwen dev`), GWEN enriches global service types.

```typescript
const math = api.services.get('math'); // typed as MathService
console.log(math.add(2, 2));
```

## Lifecycle Hooks

The object returned by the factory can implement optional hooks:

```typescript
definePlugin(() => ({
  name: 'ExamplePlugin',
  onInit(api) {},
  onBeforeUpdate(api, dt) {},
  onUpdate(api, dt) {},
  onRender(api) {},
  onDestroy() {},
}));
```

## Advanced: Defining WASM Plugins

Add a `wasm` field and implement `onWasmInit` / `onStep`.

```typescript
import { definePlugin, loadWasmPlugin } from '@djodjonx/gwen-kit';

export const Physics2DPlugin = definePlugin((options = {}) => {
  let wasmPlugin: any = null;

  return {
    name: 'Physics2D',
    provides: { physics: {} as Physics2DAPI },
    wasm: {
      id: 'physics2d',
      channels: [{ name: 'transform', direction: 'read', strideBytes: 20, bufferType: 'f32' }],
    },
    async onWasmInit(_bridge, _region, api, _bus) {
      const wasm = await loadWasmPlugin({ jsUrl: '/wasm/gwen_physics2d.js' });
      wasmPlugin = new wasm.Physics2DPlugin();
      api.services.register('physics', wasmPlugin);
    },
    onStep(dt) {
      wasmPlugin?.step(dt);
    },
    onDestroy() {
      wasmPlugin?.free();
    },
  };
});
```

## Typing Instance Variables

Because `definePlugin` returns a constructor value, use `GwenPluginInstance` to type instance refs:

```typescript
import type { GwenPluginInstance } from '@djodjonx/gwen-kit';
import { AudioPlugin } from './AudioPlugin';

let pluginRef: GwenPluginInstance<typeof AudioPlugin>;
```

## Next Steps

- [Official Plugins](/plugins/official) - Check built-in plugins for real-world patterns.
- [Systems](/core/systems) - Consume plugin services in gameplay logic.
- [Configuration](/core/configuration) - Register your plugins.
