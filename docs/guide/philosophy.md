# Philosophy

GWEN is built on simple principles that make game development predictable and enjoyable.

## Scene-Driven Architecture

Games are state machines. You're always in a **scene** (MainMenu, GamePlay, GameOver, Settings).

```typescript
export const MainMenuScene = defineScene('MainMenu', () => ({
  onEnter(api) {
    // Setup menu UI, music, etc.
  },
  onExit(api) {
    // Cleanup before next scene
  }
}));
```

Scenes orchestrate everything: which systems run, which UI displays, what entities exist.

## ECS Without the Boilerplate

**Components** are pure data:

```typescript
export const Health = defineComponent({
  name: 'health',
  schema: { current: Types.i32, max: Types.i32 }
});
```

**Systems** are pure logic:

```typescript
import { defineSystem } from '@gwen/engine-core';

export const DamageSystem = defineSystem({
  name: 'DamageSystem',
  onUpdate(api, dt) {
    const entities = api.query(['health', 'damaged']);
    // Process damage
  }
});
```

**Entities** are just IDs:

```typescript
const enemy = api.createEntity();
api.addComponent(enemy, Position, { x: 100, y: 50 });
api.addComponent(enemy, Health, { current: 10, max: 10 });
```

No classes. No inheritance. Just composition.

## Plugin-First Extensibility

Want input? Audio? Debug overlay?

```typescript
export default defineConfig({
  plugins: [
    new InputPlugin(),
    new AudioPlugin(),
    new DebugPlugin()
  ]
});
```

Plugins expose **services** that your systems can access:

```typescript
onUpdate(api, dt) {
  const keyboard = api.services.get('keyboard');
  const audio = api.services.get('audio');

  if (keyboard.isPressed('Space')) {
    audio.play('shoot');
  }
}
```

Type-safe. Auto-completed. Zero configuration.

## Performance by Default

GWEN's core is written in Rust and compiled to WebAssembly.

This means:
- **10K+ entities** at 60 FPS
- **Cache-friendly** data layout
- **Zero garbage collection** pauses
- **Predictable** frame times

But you write TypeScript and never touch Rust code.

## Reusability Through Prefabs

Don't repeat entity creation:

```typescript
export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  create: (api, x, y) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Health, { current: 5, max: 5 });
    api.addComponent(id, AIBehavior, { state: 'patrol' });
    return id;
  }
});

// Later, anywhere:
api.prefabs.instantiate('Enemy', 100, 200);
api.prefabs.instantiate('Enemy', 300, 150);
```

## Flexibility Where It Matters

GWEN doesn't force a renderer on you. Choose based on your game's needs:

### Canvas2D
Blazing fast for 2D pixel/sprite games:

```typescript
export const PlayerUI = defineUI({
  name: 'PlayerUI',
  render(api, id) {
    const { ctx } = api.services.get('renderer');
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(x, y, 32, 32);
  }
});
```

### HTML/CSS
Perfect for menus, HUD, UI overlays:

```typescript
new HtmlUIPlugin() // Enable in config

// Use standard HTML
api.services.get('htmlUI').mount('menu', '<button>Start</button>');
```

### WebGL (Three.js, Babylon.js)
Integrate any WebGL library via services:

```typescript
export const Model3DUI = defineUI({
  name: 'Model3DUI',
  render(api, id) {
    const scene = api.services.get('three-scene');
    // Update your 3D objects directly
  }
});
```

### Mix Multiple Renderers
Use Canvas for gameplay sprites, HTML for UI:

```typescript
export const GameScene = defineScene('Game', () => ({
  ui: [
    PlayerUI,      // Canvas2D
    EnemyUI,       // Canvas2D
    HUDMenuUI      // HTML
  ]
}));
```

**This is a core strength**: no abstraction layer forcing you into one paradigm. You control the rendering layer entirely.

## Why TypeScript?

- **Type safety** catches bugs before runtime
- **IntelliSense** guides you as you code
- **Refactoring** is safe and fast
- **Documentation** is built-in via types
- **Ecosystem** - use any npm package

## Why Not Just Use...

### Unity/Godot?

- GWEN is **web-native** (no export step, no WebGL quirks)
- **Smaller runtime** (<50KB core)
- **TypeScript ecosystem** (npm, bundlers, DevTools)
- **Open source** and hackable

### Phaser/PixiJS?

- GWEN has **true ECS** (not GameObject-based)
- **Type-safe services** (not global singletons)
- **Scene lifecycle** built-in
- **High-performance core** (Rust/WASM)

### Bevy (Rust)?

- GWEN targets **TypeScript developers**
- **No Rust knowledge** required
- **Faster iteration** (no compile step)
- **Web-first** (no WebAssembly export headaches)

## Design Goals

1. **Fast to start** - `pnpm create` and you're coding in 30 seconds
2. **Hard to break** - TypeScript prevents most bugs
3. **Easy to understand** - clear folder structure, no magic
4. **Scalable** - from jam games to production apps
5. **Hackable** - you own the code, customize anything

## Core Beliefs

**Explicit over implicit** - We don't hide config or use global state.

**Composition over inheritance** - ECS naturally leads to reusable logic.

**Convention over configuration** - Standard structure means less setup.

**Developer experience matters** - If it's annoying, we fix it.

## Next Steps

- [Project Structure](/guide/project-structure) - How files are organized
- [Components](/core/components) - Define your game data
- [Systems](/core/systems) - Implement gameplay logic
