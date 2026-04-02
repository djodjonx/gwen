# UI Plugin

**Package:** `@gwenjs/ui`
**Service key:** `ui` (`UIService`)

HTML/CSS overlay rendered above the game canvas. Build reactive game UIs — health bars, score displays, pause menus, dialogue boxes — using standard web tech. State is signal-based: when data changes, only the affected DOM nodes re-render.

## Install

```bash
gwen add @gwenjs/ui
```

## Register

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  modules: ['@gwenjs/ui'],
})
```

The plugin creates an absolutely-positioned `<div>` overlay that sits on top of the game canvas and intercepts no pointer events by default (use `pointer-events: auto` on specific UI elements that need interaction).

## Service API

### Mounting components

| Method | Description |
|--------|-------------|
| `ui.mount(component, options?)` | Mount a UI component and return its instance ID. |
| `ui.unmount(id)` | Remove a mounted component from the DOM. |
| `ui.unmountAll()` | Remove every mounted component. Typically called on scene exit. |
| `ui.update(id, props)` | Push new props into a mounted component, triggering a reactive update. |

`options` shape:

```typescript
interface MountOptions {
  id?:       string      // stable ID for later reference (auto-generated if omitted)
  target?:   HTMLElement // mount inside a specific element instead of the overlay
}
```

### Defining UI components

Use `defineUI()` to create a component:

```typescript
import { defineUI, signal, computed } from '@gwenjs/ui'

export const HUDComponent = defineUI<{ maxHp: number }>((props) => {
  const hp    = signal(props.maxHp)
  const pct   = computed(() => hp.value / props.maxHp)

  return {
    template: `
      <div class="hud">
        <div class="hp-bar" style="width: {{ pct * 100 }}%"></div>
      </div>
    `,
    expose: { setHp: (v: number) => { hp.value = v } },
  }
})
```

### Reactive signals

| Export | Description |
|--------|-------------|
| `signal(initial)` | Create a reactive value. Read `.value`, write `.value = ...`. |
| `computed(fn)` | Derive a value from one or more signals. Read-only. |
| `effect(fn)` | Run a side-effect whenever its signal dependencies change. |

### Scene integration

Declare UI components directly on `defineScene` so they mount/unmount automatically with the scene:

```typescript
import { defineScene } from '@gwenjs/core'
import { HUDComponent, PauseMenu } from '../ui'

export const gameScene = defineScene({
  ui: [HUDComponent, PauseMenu],
  systems: [...],
})
```

## Options

`UIPlugin` takes no constructor options.

## Example

```typescript
// ui/ScoreDisplay.ts
import { defineUI, signal } from '@gwenjs/ui'

export const ScoreDisplay = defineUI(() => {
  const score = signal(0)

  return {
    template: `<div class="score">Score: {{ score }}</div>`,
    expose: {
      setScore: (v: number) => { score.value = v },
    },
  }
})

// systems/scoreSystem.ts
import { defineSystem, useService, onUpdate } from '@gwenjs/core'
import { ScoreDisplay } from '../ui/ScoreDisplay'

export const scoreSystem = defineSystem(() => {
  const ui      = useService('ui')
  const scoreId = ui.mount(ScoreDisplay)

  let score = 0

  onUpdate(() => {
    if (playerScoredPoint()) {
      score += 100
      ui.update(scoreId, {})       // signal update is internal; no props needed
    }
  })
})
```

::: tip CSS scoping
Each `defineUI` component's template is wrapped in a scoped shadow root by default. Use `scoped: false` in the `defineUI` options if you need global CSS classes.
:::

## Related

- [Input Plugin](/plugins/input) — handle button clicks in UI components
- [Audio Plugin](/plugins/audio) — play UI sounds on interaction
- [Debug Plugin](/plugins/debug) — separate debug overlay that doesn't use the UI plugin
