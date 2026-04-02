# React Three Fiber Adapter

Package: `@gwenjs/r3f`

Bridge package to connect a GWEN engine instance with React Three Fiber.

## Install

```bash
pnpm add @gwenjs/r3f @react-three/fiber react react-dom three
```

## API

Main exports:
- `GwenProvider`
- `GwenLoop`
- `useGwenEngine()`
- `useService(name)`
- `usePhysicsBodyState(entityId, serviceName?)`
- `useEvent(hookName, handler, deps?)`
- `useQuery(componentTypes)`
- `useComponentValue(entityId, componentType)`
- `useEntityTransform(entityId, targetRef, transformComponent?)`

## Example

```tsx
function SceneRoot({ engine }) {
  return (
    <Canvas>
      <GwenProvider engine={engine}>
        <GwenLoop />
        <PlayerMesh />
      </GwenProvider>
    </Canvas>
  );
}
```

```tsx
function PlayerMesh() {
  const players = useQuery(['PlayerTag', 'Transform3D']);
  useEvent('physics3d:collision', (ev) => console.log(ev));
  return <>{players.length}</>;
}
```

## Source

- `packages/r3f/src/index.ts`
- `packages/r3f/src/adapter.tsx`
