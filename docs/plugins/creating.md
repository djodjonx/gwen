# Creating Plugins

Extend GWEN with custom plugins by implementing the `GwenPlugin` interface.

## Plugin Structure

Plugins are TypeScript classes that implement `GwenPlugin<N, P>`:

```typescript
import type { GwenPlugin, EngineAPI } from '@gwen/engine-core';

export interface MyService {
  doSomething(): void;
}

export class MyPlugin implements GwenPlugin<'MyPlugin', { myService: MyService }> {
  readonly name = 'MyPlugin' as const;

  /**
   * Declare services this plugin provides.
   * Values are phantom types — never read at runtime.
   */
  readonly provides = { myService: {} as MyService };

  constructor(config?: { option: string }) {
    // Setup from config
  }

  onInit(api: EngineAPI): void {
    // Initialize and register services
    const service: MyService = {
      doSomething: () => console.log('Hello!')
    };
    api.services.register('myService', service);
  }

  onUpdate(api: EngineAPI, dt: number): void {
    // Run every frame
  }

  onDestroy(): void {
    // Cleanup
  }
}
```

## Registering Services

Register services in `onInit()`:

```typescript
onInit(api: EngineAPI): void {
  const service = {
    value: 42,
    method: () => 'result'
  };
  api.services.register('myService', service);
}
```

Access from systems:

```typescript
const service = api.services.get('myService');
console.log(service.value); // 42
console.log(service.method()); // 'result'
```

## Type Safety

When you implement `GwenPlugin<'MyPlugin', { myService: MyService }>`, GWEN automatically includes `myService` in the inferred `GwenServices` type — **no manual declaration needed**.

Simply declare your service interface and implement the plugin interface:

```typescript
// In your plugin file
export interface MyService {
  value: number;
  method(): string;
}

export class MyPlugin implements GwenPlugin<'MyPlugin', { myService: MyService }> {
  readonly name = 'MyPlugin' as const;
  readonly provides = { myService: {} as MyService };

  onInit(api: EngineAPI) {
    api.services.register('myService', { value: 42, method: () => 'result' });
  }
}
```

Add it to your config, then run `gwen prepare` (or `gwen dev`) — `GwenServices` is updated automatically:

```typescript
// gwen.config.ts
export const gwenConfig = defineConfig({
  tsPlugins: [new MyPlugin()],
});
```

Then use the typed API — **no annotation needed** after `gwen prepare`:

```typescript
export const MySystem = defineSystem({
  name: 'MySystem',
  onUpdate(api, dt: number) {
    const service = api.services.get('myService'); // ✅ Typed automatically
    console.log(service.value);
  }
});
```

## Plugin Configuration

Plugins can accept constructor options:

```typescript
export interface AudioPluginConfig {
  masterVolume?: number;
}

export class AudioPlugin implements GwenPlugin<'AudioPlugin', { audio: AudioPlugin }> {
  readonly name = 'AudioPlugin' as const;
  readonly provides = { audio: {} as AudioPlugin };

  private config: Required<AudioPluginConfig>;

  constructor(config: AudioPluginConfig = {}) {
    this.config = {
      masterVolume: config.masterVolume ?? 0.8
    };
  }

  onInit(api: EngineAPI): void {
    // Use this.config
    api.services.register('audio', this);
  }
}
```

Register in config:

```typescript
export default defineConfig({
  engine: { maxEntities: 5000 },
  tsPlugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.9 }),
    new Canvas2DRenderer({ width: 800, height: 600 })
  ]
});
```

## Lifecycle Hooks

All hooks are optional:

```typescript
export class MyPlugin implements GwenPlugin<'MyPlugin'> {
  readonly name = 'MyPlugin' as const;

  /**
   * Called once when plugin loads (scene starts or engine initializes).
   * Use for setup: initialize services, create resources, etc.
   */
  onInit(api: EngineAPI): void {
    // Setup
  }

  /**
   * Called before main update (optional).
   * Use for pre-processing (input reading, etc).
   */
  onBeforeUpdate(api: EngineAPI, dt: number): void {
    // Pre-processing
  }

  /**
   * Called every frame after systems update.
   * Use for per-frame logic.
   */
  onUpdate(api: EngineAPI, dt: number): void {
    // Per-frame logic
  }

  /**
   * Called after all rendering (optional).
   * Use for rendering if needed.
   */
  onRender(api: EngineAPI): void {
    // Rendering logic
  }

  /**
   * Called when plugin is destroyed (scene ends or engine shuts down).
   * Use for cleanup: close files, disconnect networks, etc.
   */
  onDestroy(): void {
    // Cleanup
  }
}
```

## Real Examples

See official plugins:
- [`InputPlugin`](/plugins/official#gwenplugin-input) - Keyboard, mouse, gamepad
- [`AudioPlugin`](/plugins/official#gwenplugin-audio) - Web Audio API wrapper
- [`HtmlUIPlugin`](/plugins/official#gwenplugin-html-ui) - HTML/DOM integration

## Next Steps

- [Official Plugins](/plugins/official) - Built-in plugins reference
- [Systems](/core/systems) - Use plugins in game logic
- [Configuration](/core/configuration) - Register plugins

