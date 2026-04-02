---
name: gwen-kit
description: Expert skill for GWEN plugin authoring, defining lifecycle hooks, and using the kit's type-safe utilities.
---

# Plugin Authoring Kit Expert Skill

## Context
GWEN Kit provides the building blocks for plugin authors. It defines the `definePlugin` factory and type-safe helpers to extend the engine without knowing its internal implementation details.

## Instructions

### 1. Defining a TypeScript Plugin
Use `definePlugin` to create a new plugin.
```typescript
import { definePlugin } from '@gwenjs/kit';

export const MyPlugin = definePlugin((config: MyConfig = {}) => {
  return {
    name: 'MyPlugin',
    provides: { myService: {} as MyService },
    onInit(api) {
      api.services.register('myService', { /* Logic */ });
    },
    onUpdate(api, dt) { /* Game loop hook */ },
    onDraw(ctx, api) { /* Render hook */ }
  };
});
```

### 2. Plugin Lifecycle
Plugins follow a strict lifecycle managed by the engine:
- **`onInit(api)`**: Initialization and service registration.
- **`onWasmInit(...)`**: (Optional) Called for WASM plugins to initialize shared memory or load modules.
- **`onBeforeUpdate(api, dt)`**: Pre-loop hook (e.g., input sampling).
- **`onUpdate(api, dt)`**: Main loop hook.
- **`onStep(dt)`**: Fixed-step logic hook (e.g., physics).
- **`onDraw(ctx, api)`**: Rendering hook.
- **`onDestroy()`**: Cleanup.

### 3. Service Registration
Plugins can provide services to other plugins or game logic via `api.services`.
- Register in `onInit`: `api.services.register('name', instance)`.
- Consume in game logic: `api.services.get('name')`.

### 4. Extending Prefabs & UI
Plugins can define how they interact with prefabs or UI components.
```typescript
export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    myService: { from: 'my-package', exportName: 'MyService' }
  },
  prefabExtensionTypes: {
    myPhysics: { from: 'my-package', exportName: 'MyExtension' }
  }
};
```

### 5. WASM Plugins (`loadWasmPlugin`)
Load WASM modules within a plugin lifecycle.
```typescript
const wasm = await loadWasmPlugin<MyWasmModule>({
  jsUrl: '/wasm/my_plugin.js',
  wasmUrl: '/wasm/my_plugin_bg.wasm',
  name: 'MyWasmPlugin'
});
```

## Available Resources
- `packages/@gwenjs/kit/src/define-plugin.ts`: `definePlugin` factory and lifecycle types.
- `packages/@gwenjs/kit/src/config.ts`: `defineConfig` and project configuration types.

## Constraints
- **Naming**: Plugin names must be unique within a project.
- **Purity**: Avoid side effects in the `definePlugin` factory itself; use `onInit` for initialization.
- **Dependencies**: Ensure any required services are registered before they are used (order in `gwen.config.ts` matters).
- **WASM**: WASM plugins must use the **Plugin Data Bus** for communication if they don't use shared memory directly.
