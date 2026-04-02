---
name: gwen-sprite-anim
description: Expert skill for frame-based animations, state machine (FSM) management, and conditional transitions.
---

# Sprite Animation Expert Skill

## Context
Sprite Animation in GWEN is driven by a Runtime that manages frame-based clips and state machines per entity. It is decoupled from rendering but integrates via UI extensions or manual systems.

## Instructions

### 1. State Machine Controller Design
Define controllers with states and conditional transitions.
```typescript
const controller = {
  states: {
    idle: { clip: 'hero_idle' },
    run: { clip: 'hero_run', speed: 1.2 }
  },
  transitions: [
    { 
      from: 'idle', to: 'run', 
      conditions: [{ param: 'speed', op: 'greater', value: 0.1 }] 
    },
    { 
      from: 'run', to: 'idle', 
      conditions: [{ param: 'speed', op: 'less', value: 0.1 }] 
    }
  ]
};
```

### 2. Runtime Parameters (`animator` service)
Control the FSM dynamically using parameters:
- `setParam(entityId, 'speed', 1.5)`: Drives transitions.
- `setTrigger(entityId, 'jump')`: Fires a one-time transition (automatic reset).
- `getParam(entityId, 'speed')`: Query current state values.

### 3. Manual Clip Playback
When bypass the FSM, use:
- `play(entityId, clip, options)`: Loop, reverse, speed, offset.
- `pause(entityId)` / `resume(entityId)`.

### 4. Lifecycle Hooks
- `spriteAnim:frame`: Emitted on every frame change. Provides `frameCursor` and `frameIndex`.
- `spriteAnim:complete`: Emitted when a non-looping animation finishes.
- `spriteAnim:transition`: Emitted when the FSM changes states.

## Available Resources
- `packages/@gwenjs/plugin-sprite-anim/src/types.ts`: `SpriteAnimController` and `SpriteAnimClip` type definitions.
- `packages/@gwenjs/plugin-sprite-anim/src/runtime.ts`: Core animator engine.

## Constraints
- **Sub-steps**: For high-speed animations or low FPS, use `fixedDelta` and `maxSubSteps` in config to prevent frame skips.
- **Culling**: Use `setCulled(entityId, true)` to stop ticking animations for off-screen entities.
- **UI Extension**: Requires `ui:extensions` hook to be active for automatic attachment.
