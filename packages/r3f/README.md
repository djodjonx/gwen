# @gwenengine/r3f

React Three Fiber adapter foundation for GWEN.

Current scope (RFC-006 foundation):
- `GwenProvider` to expose a shared `Engine` instance,
- `GwenLoop` to bridge R3F frame deltas to `engine.advance(delta)`,
- hooks: `useGwenEngine`, `useService`, `usePhysicsBodyState`, `useEvent`, `useQuery`, `useComponentValue`, `useEntityTransform`.

## Installation

```bash
npm install @gwenengine/r3f
```

## Usage

```tsx
import { Canvas } from '@react-three/fiber';
import { GwenProvider, GwenLoop } from '@gwenengine/r3f';
import { initWasm, createEngine } from '@gwenengine/core';

await initWasm('physics3d');
const { engine } = await createEngine({ engine: { loop: 'external' } });

export function App() {
  return (
    <Canvas>
      <GwenProvider engine={engine}>
        <GwenLoop />
      </GwenProvider>
    </Canvas>
  );
}
```

## Hooks

```tsx
import { useQuery, useEvent, usePhysicsBodyState, useComponentValue, useEntityTransform } from '@gwenengine/r3f';

function PlayerMesh({ id, meshRef }: { id: bigint; meshRef: React.MutableRefObject<any> }) {
  // Query entities with required components
  const players = useQuery(['PlayerTag', 'Transform3D']);

  // Read one component value and keep it updated each frame
  const health = useComponentValue<{ hp: number }>(id, 'Health');

  // Read physics body state from service each frame
  const body = usePhysicsBodyState<{ position: { x: number; y: number; z: number } }>(id);

  // Subscribe to a GWEN event/hook from React
  useEvent('physics:collision', (ev) => {
    console.log('collision', ev);
  });

  console.log(players.length, health?.hp, body?.position.x);

  // Apply Transform3D to a target ref each frame
  useEntityTransform(id, meshRef);

  return null;
}
```

## Notes

- `GwenLoop` advances only when engine config uses `loop: 'external'`.
- `usePhysicsBodyState` and `useComponentValue` use structural deep-equality (2 levels) to avoid unnecessary React re-renders when the engine returns structurally identical data on consecutive frames.
- `useEntityTransform` writes directly to Three.js object properties — it never triggers a React render.

