# RFC-006 — R3F Adapter

**Statut:** Draft  
**Priorité:** P2 — Milestone 3  
**Packages impactés:** `@gwen/adapter-r3f` (nouveau)

---

## Résumé

Créer `@gwen/adapter-r3f` : package React connectant GWEN à React Three Fiber.
Fournit `GwenProvider`, `GwenLoop`, et des hooks React pour accéder à l'ECS depuis Three.js.

---

## Design détaillé

### 1. `GwenProvider` + `GwenLoop`

```tsx
// Lifecycle engine
export function GwenProvider({ engine, children }: { engine: Engine; children: ReactNode }) {
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);
  return <GwenContext.Provider value={engine}>{children}</GwenContext.Provider>;
}

// Pilote la boucle depuis R3F (RFC-003 required)
export function GwenLoop({ priority = -1 }: { priority?: number }) {
  const engine = useEngine();
  useFrame((_, delta) => { engine.advance(delta); }, priority);
  return null;
}
```

### 2. Hooks

```typescript
// Service injection
export function useService<K extends ServiceKey>(name: K): ServiceValue<K> {
  return useEngine().api.services.get(name);
}

// Query réactive (re-render si entités ajoutées/supprimées)
export function useQuery(components: ComponentDef[]): EntityId[] {
  const engine = useEngine();
  const [entities, setEntities] = useState(() => engine.api.query(components));
  useEffect(() => {
    return engine.hooks.hook('ecs:mutation', () => {
      const next = engine.api.query(components);
      setEntities(prev => prev.length !== next.length ? next : prev);
    });
  }, [engine]);
  return entities;
}

// Sync Transform3D → Object3D (zero-copy depuis buffer WASM)
export function useEntityTransform(entityId: EntityId, ref: RefObject<THREE.Object3D>): void {
  const engine = useEngine();
  useFrame(() => {
    const obj = ref.current;
    if (!obj) return;
    const buf = engine.getTransformBuffer(); // Float32Array WASM
    const base = engine.getEntityBufferIndex(entityId) * 12;
    if (base < 0) return;
    obj.position.set(buf[base], buf[base+1], buf[base+2]);
    _quat.set(buf[base+3], buf[base+4], buf[base+5], buf[base+6]);
    obj.setRotationFromQuaternion(_quat);
    obj.scale.set(buf[base+7], buf[base+8], buf[base+9]);
  });
}
const _quat = new THREE.Quaternion(); // 0 alloc

// Valeur de composant réactive
export function useComponentValue<S extends ComponentSchema>(
  id: EntityId, def: ComponentDefinition<S>
): InferSchemaType<S> | undefined {
  const engine = useEngine();
  const [value, setValue] = useState(() => engine.api.component.get(id, def));
  const lastRef = useRef(value);
  useFrame(() => {
    const next = engine.api.component.get(id, def);
    if (!shallowEqual(next, lastRef.current)) { lastRef.current = next; setValue(next); }
  });
  return value;
}

// Subscribe aux hooks engine
export function useEvent<K extends keyof GwenDefaultHooks>(
  hookName: K, handler: (e: GwenDefaultHooks[K]) => void, deps: DependencyList = []
): void {
  const engine = useEngine();
  useEffect(() => engine.hooks.hook(hookName, handler), [engine, hookName, ...deps]);
}

// Accès au buffer raw (InstancedMesh zero-copy)
export function useMemory(): () => Float32Array {
  const engine = useEngine();
  return useCallback(() => engine.getTransformBuffer(), [engine]);
}
```

### 3. `createInstancedSync` — InstancedMesh zero-copy

```typescript
export function createInstancedSync(config: {
  query: ComponentDef[];
  geometry: ReactNode;
  material: ReactNode;
}): React.FC {
  return function InstancedSync() {
    const engine = useEngine();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const entities = useQuery(config.query);
    const getBuffer = useMemory();

    useFrame(() => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const buf = getBuffer();
      for (let i = 0; i < entities.length; i++) {
        const base = engine.getEntityBufferIndex(entities[i]) * 12;
        if (base < 0) continue;
        _pos.set(buf[base], buf[base+1], buf[base+2]);
        _q.set(buf[base+3], buf[base+4], buf[base+5], buf[base+6]);
        _scale.set(buf[base+7], buf[base+8], buf[base+9]);
        _mat.compose(_pos, _q, _scale);
        mesh.setMatrixAt(i, _mat);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });

    return (
      <instancedMesh ref={meshRef} args={[undefined, undefined, entities.length]}>
        {config.geometry}
        {config.material}
      </instancedMesh>
    );
  };
}
// Réutilisés — 0 alloc/frame
const _pos = new THREE.Vector3();
const _q   = new THREE.Quaternion();
const _scale = new THREE.Vector3(1,1,1);
const _mat  = new THREE.Matrix4();
```

### 4. Exemple complet — Mario Kart minimal

```tsx
const engine = await createEngine({ loop: 'external', plugins: [...] });
await engine.init();

const KartsRenderer = createInstancedSync({
  query: [KartState, Transform3D],
  geometry: <boxGeometry args={[1.6, 0.8, 2.4]} />,
  material: <meshStandardMaterial />,
});

function App() {
  return (
    <GwenProvider engine={engine}>
      <Canvas>
        <GwenLoop priority={-1} />
        <KartsRenderer />
        <TrackMesh />
      </Canvas>
    </GwenProvider>
  );
}

function SpeedHUD({ kartId }: { kartId: EntityId }) {
  const state = useComponentValue(kartId, KartState);
  return <div>{Math.round((state?.speed ?? 0) * 3.6)} km/h</div>;
}
```

---

## Questions ouvertes

- `<GwenCanvas>` wrapper combinant `<Canvas>` + `<GwenProvider>` + `<GwenLoop>` ?
- Comment synchroniser scènes GWEN et React Router ?
