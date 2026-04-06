# RFC — @gwenjs/input Redesign (GWEN Native Controller System)

**Date:** 2026-04-06  
**Status:** Draft  
**Package:** `@gwenjs/input`  
**Branch:** `gwen-v2-alpha`

---

## 1. Problem Statement

The current `@gwenjs/input` plugin provides low-level device access (keyboard, mouse, gamepad) and a basic `InputMapper` for action bindings. It lacks:

- **Touch/mobile support** — no `TouchInput`, no virtual joystick/buttons
- **Input contexts** — no way to stack/swap binding sets at runtime (menu vs gameplay vs vehicle)
- **Processor pipeline** — only a global gamepad deadzone; no per-binding Scale, Invert, Smooth, etc.
- **Interactions** — no Hold, Tap, DoubleTap, ChordedWith semantics
- **Axis1D actions** — `readAxis1D` is typed but not implemented
- **Mouse as axis binding** — mouse delta cannot be bound to actions
- **Unified pointer** — no abstraction over mouse + touch
- **Runtime rebinding** — no way to change bindings at runtime or serialize them
- **Multi-player local** — no per-player context management or device assignment
- **`useAction()` composable** — no high-level, type-safe action composable

This RFC defines a complete redesign of the plugin using a "GWEN Native" approach: composables-first, type-safe actions, stackable input contexts, full touch support, and clean multi-player APIs. It is a **breaking change** — no backwards compatibility with the current API.

---

## 2. Design Goals

1. **Composables-first** — all player-facing APIs are composables usable in `defineSystem()`
2. **Actions as first-class citizens** — define actions once, bind to any device
3. **Stackable contexts** — contexts activated/deactivated at runtime by priority
4. **Processors** — transform pipeline per-binding (DeadZone, Scale, Smooth, etc.)
5. **Interactions** — semantic layer per-binding (Tap, Hold, DoubleTap, ChordedWith)
6. **Touch first-class** — `TouchDevice`, gestures, virtual controls built-in
7. **Pointer unification** — `usePointer()` abstracts mouse + touch
8. **Multi-player local** — up to 4 players, each with their own context stack and device assignment
9. **Runtime rebinding** — capture input, rebind, export/import snapshot
10. **Type safety** — `useAction(Jump)` returns `ButtonActionState`, never `unknown`

---

## 3. Package Structure

```
packages/input/src/
├── index.ts                      # Public barrel
├── plugin/
│   └── index.ts                  # InputPlugin (definePlugin)
├── actions/
│   ├── define-action.ts          # defineAction<T>()
│   ├── action-state.ts           # ButtonActionState, Axis1DActionState, Axis2DActionState
│   └── types.ts                  # ActionType, ActionRef<T>
├── contexts/
│   ├── define-input-context.ts   # defineInputContext()
│   ├── input-context.ts          # InputContext runtime class
│   └── binding.ts                # bind(), AnyBinding, BindingSource
├── devices/
│   ├── keyboard.ts               # KeyboardDevice
│   ├── mouse.ts                  # MouseDevice (+ delta tracking)
│   ├── gamepad.ts                # GamepadDevice
│   ├── touch.ts                  # TouchDevice (new)
│   └── pointer.ts                # PointerDevice (mouse+touch unified)
├── processors/
│   ├── index.ts
│   ├── deadzone.ts               # DeadZone(threshold)
│   ├── scale.ts                  # Scale(factor)
│   ├── invert.ts                 # Invert() / InvertX() / InvertY()
│   ├── clamp.ts                  # Clamp(min, max)
│   ├── normalize.ts              # Normalize()
│   └── smooth.ts                 # Smooth(factor)
├── interactions/
│   ├── index.ts
│   ├── press.ts                  # Press() — default
│   ├── release.ts                # Release()
│   ├── tap.ts                    # Tap({ maxDuration })
│   ├── hold.ts                   # Hold({ holdTime })
│   ├── double-tap.ts             # DoubleTap({ maxGap })
│   ├── chord.ts                  # Chord(key1, key2, ...)
│   ├── chorded-with.ts           # ChordedWith(actionRef, condition)
│   └── types.ts                  # Interaction interface
├── gestures/
│   ├── swipe.ts                  # TouchGesture.Swipe({ direction, minDistance })
│   └── pinch.ts                  # TouchGesture.Pinch()
├── players/
│   ├── player-input.ts           # PlayerInput class
│   └── player-manager.ts         # PlayerManager (up to 4 players)
├── virtual/
│   ├── virtual-joystick.ts       # VirtualJoystick (DOM canvas overlay)
│   └── virtual-button.ts         # VirtualButton (DOM canvas overlay)
├── composables/
│   ├── use-action.ts             # useAction(ref) → ActionState<T>
│   ├── use-player.ts             # usePlayer(index) → PlayerInput
│   ├── use-input.ts              # useInput() → InputService
│   ├── use-pointer.ts            # usePointer() → PointerDevice
│   ├── use-keyboard.ts           # useKeyboard() — raw escape hatch
│   ├── use-mouse.ts              # useMouse() — raw escape hatch
│   ├── use-gamepad.ts            # useGamepad(index) — raw escape hatch
│   └── use-touch.ts              # useTouch() — raw escape hatch
├── constants/
│   ├── keys.ts                   # KeyCode enum (unchanged)
│   └── gamepad.ts                # GamepadButtonId, GamepadAxisId (unchanged)
└── augment.ts                    # GwenProvides declaration merging
```

---

## 4. Core Types

### 4.1 Action Types

```typescript
type ActionType = 'button' | 'axis1d' | 'axis2d'

interface ActionRef<T extends ActionType> {
  readonly id: symbol
  readonly name: string
  readonly type: T
}

function defineAction<T extends ActionType>(name: string, config: { type: T }): ActionRef<T>
```

### 4.2 Action States

```typescript
interface ButtonActionState {
  readonly type: 'button'
  readonly isPressed: boolean         // justTriggered OR held
  readonly isJustTriggered: boolean   // rising edge (respects Interaction)
  readonly isJustReleased: boolean    // falling edge
  readonly holdTime: number           // seconds held (useful for charge bar)
}

interface Axis1DActionState {
  readonly type: 'axis1d'
  readonly value: number              // -1..1 after processors
  readonly rawValue: number           // before processors
}

interface Axis2DActionState {
  readonly type: 'axis2d'
  readonly value: Readonly<{ x: number; y: number }>   // after processors
  readonly rawValue: Readonly<{ x: number; y: number }>
  readonly magnitude: number
}

type ActionState<T extends ActionType> =
  T extends 'button' ? ButtonActionState :
  T extends 'axis1d' ? Axis1DActionState :
  Axis2DActionState
```

---

## 5. Input Contexts & Bindings

### 5.1 defineInputContext

```typescript
interface InputContextConfig {
  priority: number                // higher = wins over lower
  bindings: BindingEntry[]
}

function defineInputContext(name: string, config: InputContextConfig): InputContextDef

// Example
const GameplayContext = defineInputContext('gameplay', {
  priority: 0,
  bindings: [
    bind(Jump, Keys.Space),
    bind(Jump, GamepadButtons.South),
    bind(Jump, TouchGesture.Tap({ fingers: 1 })),
    bind(Move, Composite2D({ up: Keys.W, down: Keys.S, left: Keys.A, right: Keys.D })),
    bind(Move, GamepadStick.Left, { processors: [DeadZone(0.15), Smooth(0.08)] }),
    bind(Move, VirtualJoystick('move-stick')),
    bind(Camera, MouseDelta(), { processors: [Scale(0.003)] }),
    bind(Camera, GamepadStick.Right, { processors: [DeadZone(0.15), Scale(2.0)] }),
    bind(Sprint, Keys.ShiftLeft, { interactions: [Hold({ holdTime: 0.1 })] }),
    bind(Drift, GamepadStick.LeftX, { interactions: [ChordedWith(Jump, 'isPressed')] }),
    bind(Drift, Composite({ left: Keys.ArrowLeft, right: Keys.ArrowRight }), {
      interactions: [ChordedWith(Jump, 'isPressed')]
    }),
  ]
})

const MenuContext = defineInputContext('menu', {
  priority: 10,    // menu overrides gameplay
  bindings: [
    bind(Confirm, Keys.Enter),
    bind(Back, Keys.Escape),
    bind(Confirm, GamepadButtons.South),
    bind(Back, GamepadButtons.East),
  ]
})
```

### 5.2 Binding Sources

```typescript
// Keys and mouse
Keys.Space                          // KeyCode
Keys.W, Keys.A, Keys.S, Keys.D
MouseButton.Left / Middle / Right
MouseDelta()                        // axis2d source: mouse movement delta
MouseWheel()                        // axis1d source: wheel delta

// Gamepad
GamepadButtons.South / North / East / West
GamepadButtons.LeftTrigger / RightTrigger
GamepadButtons.LeftBump / RightBump
GamepadButtons.LeftThumb / RightThumb
GamepadStick.Left                   // axis2d: left stick
GamepadStick.Right                  // axis2d: right stick
GamepadStick.LeftX / LeftY          // axis1d: individual axes
GamepadStick.RightX / RightY

// Composite
Composite2D({ up, down, left, right })   // 4 keys → axis2d
Composite({ left, right })               // 2 keys → axis1d

// Touch / Mobile
TouchGesture.Tap({ fingers: 1 })         // → button
TouchGesture.Tap({ fingers: 2 })
TouchGesture.Swipe({ direction: 'up', minDistance: 50 })  // → button
TouchGesture.Pinch()                     // → axis1d (scale delta)
TouchGesture.Rotate()                    // → axis1d (rotation radians)
VirtualJoystick('id')                    // → axis2d (on-screen)
VirtualButton('id')                      // → button (on-screen)
```

---

## 6. Processors

Applied in order to raw binding value before emitting to ActionState.

```typescript
DeadZone(threshold: number)        // set to 0 if |value| < threshold (axis1d/2d)
Scale(factor: number)              // multiply by factor
Invert()                           // multiply by -1 (axis1d, or both axes of axis2d)
InvertX()                          // invert x axis only (axis2d)
InvertY()                          // invert y axis only (axis2d)
Clamp(min: number, max: number)    // clamp value to [min, max]
Normalize()                        // normalize axis2d to unit vector (magnitude <= 1)
Smooth(factor: number)             // lerp toward target value per frame (0..1)
SwizzleXY()                        // swap x and y (axis2d)
```

---

## 7. Interactions

Applied to binding value to determine when to emit `isJustTriggered` / `isJustReleased` on a button action.

```typescript
Press()                             // default — isJustTriggered on first down frame
Release()                           // isJustTriggered on release frame
Tap({ maxDuration?: number })       // press + release within maxDuration (default 0.3s)
Hold({ holdTime: number })          // held for holdTime seconds without release
DoubleTap({ maxGap?: number })      // two taps within maxGap (default 0.3s)
Chord(...keys: KeyCode[])           // all specified keys must be held simultaneously
ChordedWith(actionRef, condition)   // only fires if actionRef is in given condition
                                    // condition: 'isPressed' | 'isJustTriggered'
```

### ChordedWith — encoding conditions in bindings, not systems

```typescript
// Drift = steer WHILE Jump is held — condition encoded in the binding
bind(Drift, GamepadStick.LeftX, {
  interactions: [ChordedWith(Jump, 'isPressed')]
})

// In the system — clean, no cross-action checks
const drift = p1.action(Drift)
onUpdate((dt) => {
  if (drift.value !== 0) {
    applyDrift(entity, drift.value, dt)   // Jump being held is guaranteed by binding
  }
})
```

---

## 8. Touch Support

### 8.1 TouchDevice

```typescript
interface TouchPoint {
  readonly id: number
  readonly position: { x: number; y: number }        // canvas-relative
  readonly startPosition: { x: number; y: number }
  readonly deltaPosition: { x: number; y: number }
  readonly phase: 'began' | 'moved' | 'stationary' | 'ended' | 'cancelled'
  readonly timestamp: number
}

class TouchDevice {
  readonly points: ReadonlyMap<number, TouchPoint>
  readonly pointCount: number
  getPoint(id: number): TouchPoint | undefined
  isTouching(): boolean
  update(): void
  attach(target: EventTarget, canvas?: HTMLCanvasElement): void
  detach(target: EventTarget): void
}
```

### 8.2 Virtual Controls (DOM overlay)

Virtual controls are rendered as a DOM overlay above the canvas. They emit the same events as physical device controls, feeding into the action system transparently.

```typescript
interface VirtualJoystickConfig {
  id: string
  side: 'left' | 'right' | 'custom'
  size: number                      // diameter in px
  position?: { x: number; y: number }  // used when side='custom', percent of viewport
  opacity?: number                  // default 0.5
  deadzone?: number                 // inner deadzone, default 0.1
}

interface VirtualButtonConfig {
  id: string
  label: string
  position: { x: number; y: number }  // percent of viewport (e.g. 80% x, 85% y)
  size?: number                        // diameter in px, default 60
  opacity?: number                     // default 0.7
}
```

Virtual controls are auto-shown on touch devices and hidden on desktop. They can be forced on/off via `InputPlugin({ touch: { forceVirtualControls: true } })`.

### 8.3 Pointer (unified mouse + touch)

```typescript
interface PointerState {
  readonly position: { x: number; y: number }    // canvas-relative
  readonly isPressed: boolean
  readonly isJustPressed: boolean
  readonly isJustReleased: boolean
  readonly type: 'mouse' | 'touch'
  readonly delta: { x: number; y: number }       // movement this frame
}
// usePointer() returns PointerState
```

---

## 9. Multi-player Local

### 9.1 PlayerInput

```typescript
class PlayerInput {
  readonly index: number

  // Context management
  activateContext(name: string): void
  deactivateContext(name: string): void
  readonly activeContexts: readonly string[]

  // Device assignment
  assignDevice(type: 'keyboard+mouse' | 'gamepad' | 'touch', slot?: number): void
  readonly assignedDevice: DeviceAssignment

  // Action reading
  action<T extends ActionType>(ref: ActionRef<T>): ActionState<T>

  // Rebinding
  rebind(action: ActionRef<any>, bindingIndex: number, newBinding: AnyBinding): void
  resetBinding(action: ActionRef<any>, bindingIndex: number): void
  resetBindings(): void

  // Capture interactive rebind — resolves with first input received
  captureNextInput(options?: { timeout?: number }): Promise<AnyBinding | null>

  // Serialization
  exportBindings(): BindingsSnapshot
  importBindings(snapshot: BindingsSnapshot): void
}
```

### 9.2 BindingsSnapshot

```typescript
interface BindingsSnapshot {
  version: 1
  player: number
  overrides: Array<{
    actionId: string        // ActionRef.name
    bindingIndex: number
    newBinding: AnyBinding
  }>
}
```

### 9.3 Device auto-detection

On startup, the engine auto-assigns devices based on availability:
- If touch device detected → `player[0].assignDevice('touch')`
- If gamepads connected → auto-assign by slot
- Keyboard+mouse always available for player 0 by default

Players can re-assign at any time. If a gamepad disconnects, its player falls back to keyboard+mouse (configurable via `onGamepadDisconnected`).

---

## 10. Plugin Configuration

```typescript
interface InputPluginConfig {
  /** Number of local players (1-4). Default: 1. */
  players?: number

  /** All InputContextDefs to register globally. */
  contexts?: InputContextDef[]

  /** Context names active by default for player 0. Default: all registered contexts. */
  defaultActiveContexts?: string[]

  /** Canvas element for mouse/touch coordinate offset. */
  canvas?: HTMLCanvasElement

  /** Event target for keyboard/mouse listeners. Default: window. */
  eventTarget?: EventTarget

  /** Touch configuration. */
  touch?: {
    enabled?: boolean                        // default: true
    forceVirtualControls?: boolean           // override auto-detection
    virtualJoysticks?: VirtualJoystickConfig[]
    virtualButtons?: VirtualButtonConfig[]
  }

  /**
   * Callback invoked whenever player bindings change.
   * Use this to persist bindings to your storage of choice.
   */
  onBindingsChanged?: (playerIndex: number, snapshot: BindingsSnapshot) => void

  /**
   * Initial bindings to restore per player (from previous session).
   * Index corresponds to player index.
   */
  initialBindings?: (BindingsSnapshot | null)[]
}
```

---

## 11. Composables

All composables must be called inside `defineSystem()`, `engine.run()`, or a plugin lifecycle hook (active engine context required).

```typescript
// High-level — recommended
useAction<T>(ref: ActionRef<T>): ActionState<T>
  // Returns action state for player 0 by default.
  // Use player.action(ref) for per-player reads.

usePlayer(index: number): PlayerInput
  // Returns PlayerInput for the given player slot.

useInput(): InputService
  // Global input service — player management, device events.

// Pointer (unified mouse + touch)
usePointer(): PointerState

// Raw escape hatches
useKeyboard(): KeyboardDevice
useMouse(): MouseDevice
useGamepad(index?: number): GamepadDevice   // default: slot 0
useTouch(): TouchDevice
```

---

## 12. GwenProvides Augmentation

```typescript
declare module '@gwenjs/core' {
  interface GwenProvides {
    'input': InputService
    'player:0': PlayerInput
    'player:1': PlayerInput
    'player:2': PlayerInput
    'player:3': PlayerInput
  }
}
```

---

## 13. Full Usage Example

```typescript
// actions.ts
import { defineAction } from '@gwenjs/input'

export const Jump    = defineAction('Jump',   { type: 'button' })
export const Move    = defineAction('Move',   { type: 'axis2d' })
export const Sprint  = defineAction('Sprint', { type: 'button' })
export const Camera  = defineAction('Camera', { type: 'axis2d' })
export const Drift   = defineAction('Drift',  { type: 'axis1d' })
export const Confirm = defineAction('Confirm',{ type: 'button' })
export const Back    = defineAction('Back',   { type: 'button' })
```

```typescript
// contexts/gameplay.ts
import {
  defineInputContext, bind, Composite2D, Composite,
  MouseDelta, TouchGesture, VirtualJoystick, GamepadStick
} from '@gwenjs/input'
import { Keys, GamepadButtons } from '@gwenjs/input/constants'
import { DeadZone, Scale, Smooth } from '@gwenjs/input/processors'
import { Hold, Tap, DoubleTap, ChordedWith } from '@gwenjs/input/interactions'
import { Jump, Move, Sprint, Camera, Drift } from '../actions'

export const GameplayContext = defineInputContext('gameplay', {
  priority: 0,
  bindings: [
    // Jump
    bind(Jump, Keys.Space),
    bind(Jump, GamepadButtons.South),
    bind(Jump, TouchGesture.Tap({ fingers: 1 })),
    // Move
    bind(Move, Composite2D({ up: Keys.W, down: Keys.S, left: Keys.A, right: Keys.D })),
    bind(Move, Composite2D({ up: Keys.ArrowUp, down: Keys.ArrowDown, left: Keys.ArrowLeft, right: Keys.ArrowRight })),
    bind(Move, GamepadStick.Left, { processors: [DeadZone(0.15), Smooth(0.08)] }),
    bind(Move, VirtualJoystick('move-stick')),
    // Camera
    bind(Camera, MouseDelta(), { processors: [Scale(0.003)] }),
    bind(Camera, GamepadStick.Right, { processors: [DeadZone(0.15), Scale(2.0)] }),
    // Sprint (hold)
    bind(Sprint, Keys.ShiftLeft, { interactions: [Hold({ holdTime: 0.1 })] }),
    bind(Sprint, GamepadButtons.LeftThumb),
    // Drift (ChordedWith Jump)
    bind(Drift, GamepadStick.LeftX, { interactions: [ChordedWith(Jump, 'isPressed')] }),
    bind(Drift, Composite({ left: Keys.ArrowLeft, right: Keys.ArrowRight }), {
      interactions: [ChordedWith(Jump, 'isPressed')]
    }),
  ]
})

export const MenuContext = defineInputContext('menu', {
  priority: 10,
  bindings: [
    bind(Confirm, Keys.Enter),
    bind(Back, Keys.Escape),
    bind(Confirm, GamepadButtons.South),
    bind(Back, GamepadButtons.East),
  ]
})
```

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/core'
import { InputPlugin } from '@gwenjs/input'
import { GameplayContext, MenuContext } from './contexts'

export default defineConfig({
  plugins: [
    InputPlugin({
      players: 2,
      contexts: [GameplayContext, MenuContext],
      defaultActiveContexts: ['gameplay'],
      canvas: document.getElementById('game') as HTMLCanvasElement,
      touch: {
        enabled: true,
        virtualJoysticks: [
          { id: 'move-stick', side: 'left', size: 120 },
        ],
        virtualButtons: [
          { id: 'jump-btn', label: '↑', position: { x: 80, y: 85 } },
        ],
      },
      onBindingsChanged(playerIndex, snapshot) {
        localStorage.setItem(`bindings-p${playerIndex}`, JSON.stringify(snapshot))
      },
      initialBindings: [
        JSON.parse(localStorage.getItem('bindings-p0') ?? 'null'),
        JSON.parse(localStorage.getItem('bindings-p1') ?? 'null'),
      ],
    })
  ]
})
```

```typescript
// systems/player-movement.ts
import { defineSystem, onUpdate, useQuery, getComponent } from '@gwenjs/core'
import { usePlayer, useAction } from '@gwenjs/input'
import { Move, Jump, Sprint, Drift } from '../actions'
import { Position, Velocity, PlayerTag } from '../components'

export const playerMovementSystem = defineSystem(() => {
  const p1 = usePlayer(0)

  const move   = p1.action(Move)
  const jump   = p1.action(Jump)
  const sprint = p1.action(Sprint)
  const drift  = p1.action(Drift)

  const entities = useQuery([Position, Velocity, PlayerTag])

  onUpdate((dt) => {
    for (const entity of entities) {
      const vel = getComponent(entity, Velocity)
      const speed = sprint.isPressed ? 300 : 150

      vel.x = move.value.x * speed
      vel.y = move.value.y * speed

      if (jump.isJustTriggered) vel.z = 500

      if (drift.value !== 0) {
        // Jump.isPressed is guaranteed by ChordedWith — no cross-action check needed
        applyDrift(entity, drift.value, dt)
      }
    }
  })
})
```

```typescript
// systems/pause-menu.ts — context switching
import { defineSystem, onUpdate } from '@gwenjs/core'
import { usePlayer, useAction } from '@gwenjs/input'
import { Back } from '../actions'

export const pauseMenuSystem = defineSystem(() => {
  const p1 = usePlayer(0)
  const back = useAction(Back)   // reads from P1, respects active contexts

  onUpdate(() => {
    if (back.isJustTriggered) {
      p1.deactivateContext('menu')
      p1.activateContext('gameplay')
    }
  })
})
```

```typescript
// rebinding UI example (in a settings screen system)
import { usePlayer } from '@gwenjs/input'
import { Jump } from '../actions'

const p1 = usePlayer(0)

async function startRebindJump() {
  const captured = await p1.captureNextInput({ timeout: 5000 })
  if (captured) {
    p1.rebind(Jump, 0, captured)
    // onBindingsChanged fires automatically → persisted to localStorage
  }
}

// Reset to defaults
function resetAllBindings() {
  p1.resetBindings()
}
```

---

## 14. Migration from Current API

This is a **complete breaking redesign**. The old API (`useKeyboard`, `useMouse`, `useGamepad`, `useInputMapper`) is removed. A migration path:

| Old | New |
|-----|-----|
| `useKeyboard().isPressed(Keys.Space)` | `useAction(Jump).isPressed` |
| `useGamepad().getLeftStick(0)` | `useAction(Move).value` |
| `useInputMapper().isActionJustPressed('Jump')` | `useAction(Jump).isJustTriggered` |
| `useInputMapper().readAxis2D('Move')` | `useAction(Move).value` |
| Raw device access | `useKeyboard()`, `useMouse()`, `useGamepad()` still available as escape hatches |

---

## 14b. Open Questions / Known Gaps

- **`InputService` type** — needs full interface definition (player management, device events, `playerCount`, `isGamepadConnected`, `onGamepadConnected`, `onGamepadDisconnected`).
- **Context priority tie-breaking** — when two active contexts have the same priority and both bind the same action, the last-activated context wins. To be confirmed during implementation.
- **`captureNextInput()` is async** — fine for settings screens, but should NOT be called from inside `onUpdate()`. A lint/runtime warning will be added.
- **Multi-player `useAction` default player** — `useAction(ref)` reads from `player[0]`. In a 2-player game, P2 systems should use `usePlayer(1).action(ref)`. Consider adding a `setActivePlayer()` scope for co-op system definitions (future).
- **Virtual controls z-index / CSS** — the DOM overlay must be above the canvas but below any game UI. The plugin will inject a `<div id="gwen-input-overlay">` with `pointer-events: none` except on virtual controls.
- **Gamepad disconnect fallback** — configurable via `InputPluginConfig.onGamepadDisconnected`. Default behavior: player keeps their context stack, falls back to keyboard+mouse if no other gamepad available.

---

## 15. Out of Scope

- VR/XR input (separate package)
- Network input (multiplayer over network — separate concern)
- Input recording/playback (future RFC)
- Editor-time input visualization (Vite plugin extension — future)

---

## 16. Acceptance Criteria

- [ ] `defineAction` creates typed `ActionRef<T>` with inferred state type
- [ ] `defineInputContext` + `bind()` registers bindings for all device sources
- [ ] `InputPlugin` registers all services on `engine.provide()`
- [ ] `useAction(ref)` returns correct `ActionState<T>` in any system
- [ ] `usePlayer(0..3)` returns `PlayerInput` per slot
- [ ] All processors apply correctly in order to binding values
- [ ] All interactions (Tap, Hold, DoubleTap, Chord, ChordedWith) modify `isJustTriggered` correctly
- [ ] `ChordedWith(actionRef, 'isPressed')` suppresses binding value when action is not in condition
- [ ] `TouchDevice` captures all W3C Touch Events correctly
- [ ] Virtual joystick and button render as DOM overlay, feed into action system
- [ ] `usePointer()` returns unified mouse/touch state
- [ ] Context priority stack resolves correctly (higher priority wins)
- [ ] `player.activateContext` / `deactivateContext` work at runtime
- [ ] `player.captureNextInput()` resolves with next physical input
- [ ] `player.exportBindings()` / `importBindings()` round-trip correctly
- [ ] `onBindingsChanged` callback fires on every rebind
- [ ] `initialBindings` config restores bindings on plugin setup
- [ ] Multi-player: each player reads from their own context stack
- [ ] Multi-player: `assignDevice('gamepad', N)` isolates gamepad slot per player
- [ ] All composables throw `GwenPluginNotFoundError` if plugin not registered
- [ ] Vitest tests cover all processor, interaction, context, device, and rebinding logic
- [ ] TypeScript: `useAction(Jump)` returns `ButtonActionState` without cast
- [ ] TypeScript: `useAction(Move).value.x` resolves without cast
