# Hooks - gwen-plugin-sprite-anim

## `spriteAnim:frame`

Signature:

```ts
(entityId, clip, state, frameCursor, frameIndex) => void
```

Called when a frame is advanced.

## `spriteAnim:complete`

Signature:

```ts
(entityId, clip, state) => void
```

Called when the current clip reaches its end.

## `spriteAnim:transition`

Signature:

```ts
(entityId, fromState, toState) => void
```

Called on successful controller transition.
