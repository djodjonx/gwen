# WASM Shared Memory

## Why Shared Memory?

GWEN's WASM modules exchange data with TypeScript through a **`SharedArrayBuffer` as linear memory**. There is no serialization, no `JSON.stringify`, no copying between the JS heap and WASM linear memory. TypeScript reads typed views (`Float32Array`, `Int32Array`, etc.) that map directly onto the bytes Rust wrote.

For 1,000 entities, SharedArrayBuffer synchronization overhead is **< 0.01ms per frame** — well within a 16ms frame budget. Data is never copied between WASM modules either; multiple WASM binaries can map their regions onto the same underlying buffer.

This model is described in depth in the [Architecture overview](/core/architecture). This page covers the TypeScript API you use when writing a [WASM plugin](./wasm-plugin).

---

## Memory Regions

A **memory region** is a named, contiguous slice of the shared buffer. You declare regions when calling `engine.loadWasmModule()`:

```ts
await engine.loadWasmModule({
  name: 'sim',
  url: new URL('./sim.wasm', import.meta.url),
  memory: [
    { name: 'positions',  byteLength: 40_000 },
    { name: 'velocities', byteLength: 40_000 },
    { name: 'flags',      byteLength: 10_000 },
  ],
  // ...
})
```

The engine allocates each region in the `SharedArrayBuffer` with the requested size. Rust receives the base pointer and byte length for each region at initialisation time.

### Accessing regions in TypeScript

Inside the `step` callback (or anywhere you hold a `WasmModuleHandle`):

```ts
step(handle, dt) {
  const region = handle.region('positions')
  // region is a WasmRegionView
}
```

---

## WasmRegionView API

`WasmRegionView` is a lightweight wrapper that gives you typed access to a region without copying.

```ts
interface WasmRegionView {
  /** The underlying SharedArrayBuffer */
  readonly buffer: SharedArrayBuffer

  /** Byte offset of this region within the buffer */
  readonly byteOffset: number

  /** Byte length of this region */
  readonly byteLength: number

  /** Typed views — no allocation, backed by the same buffer */
  asFloat32Array(): Float32Array
  asFloat64Array(): Float64Array
  asInt32Array():   Int32Array
  asUint32Array():  Uint32Array
  asInt16Array():   Int16Array
  asUint16Array():  Uint16Array
  asUint8Array():   Uint8Array
  asInt8Array():    Int8Array
}
```

### Example: reading entity positions

```ts
step(handle, dt) {
  const f32 = handle.region('positions').asFloat32Array()

  // layout: [x0, y0, z0, w0,  x1, y1, z1, w1, ...]
  for (let i = 0; i < entityCount; i++) {
    const x = f32[i * 4 + 0]
    const y = f32[i * 4 + 1]
    renderer.drawSprite(i, x, y)
  }
}
```

Typed view construction (e.g. `asFloat32Array()`) is O(1) — it creates a new TypedArray view over the existing buffer with no memory allocation. Call it once per frame and reuse the result if you access it multiple times.

---

## Ring-Buffer Channels

Channels are for **streaming discrete events** from WASM to TypeScript — things like collision pairs, audio triggers, or state-change notifications. Unlike regions (which hold continuous state), channels carry a variable number of entries per frame.

Channels are declared alongside memory regions:

```ts
channels: [
  { name: 'collisions',     capacity: 256 },
  { name: 'audio-triggers', capacity: 64  },
]
```

`capacity` is the maximum number of entries the ring buffer holds at once. If Rust pushes more than `capacity` entries before TypeScript reads, **oldest entries are overwritten**. Size for your worst-case burst.

---

## WasmRingBuffer API

```ts
interface WasmRingBuffer {
  /** Max entries before overwrite */
  readonly capacity: number

  /** Write an entry (called from Rust via the WASM binding) */
  push(data: Uint8Array): void

  /** Read and consume all pending entries; returns an iterator */
  read(): Iterable<Uint8Array>
}
```

::: tip Rust vs TypeScript direction
In practice, **Rust pushes** and **TypeScript reads**. The `push` method exists on the TypeScript interface to allow testing and simulation from JS, but in production it is called by the compiled Rust code.
:::

### Example: reading collision events

```ts
step(handle, dt) {
  for (const entry of handle.channel('collisions').read()) {
    const view = new DataView(entry.buffer, entry.byteOffset, entry.byteLength)
    const entityA = view.getUint32(0, /*littleEndian=*/ true)
    const entityB = view.getUint32(4, /*littleEndian=*/ true)
    emit('collision', { entityA, entityB })
  }
}
```

Each `entry` is a `Uint8Array` slice. Use `DataView` when your payload mixes types (integers, floats). Use a typed array directly when the payload is uniform.

---

## Performance Characteristics

| Scenario | Overhead |
|---|---|
| 1,000 entities, position reads | < 0.01 ms/frame |
| Typed view construction (`asFloat32Array()`) | O(1), no allocation |
| Ring-buffer read, 256 entries | < 0.05 ms/frame |
| Data copied between TS and WASM | **0 bytes** — shared buffer |
| Data copied between two WASM modules | **0 bytes** — same buffer |

The dominant cost is your own per-entity logic in JavaScript, not the memory access primitives.

---

## Alignment Considerations

TypedArray views require their element type to be **naturally aligned** within the buffer. If `byteOffset` is not a multiple of the element size, the view construction will throw a `RangeError`.

| Type | Required alignment |
|---|---|
| `Float32Array` / `Int32Array` / `Uint32Array` | 4 bytes |
| `Float64Array` | 8 bytes |
| `Int16Array` / `Uint16Array` | 2 bytes |
| `Uint8Array` / `Int8Array` | 1 byte (always valid) |

GWEN's region allocator aligns each region to **8 bytes** by default, so `asFloat32Array()` and `asInt32Array()` are always safe on regions allocated through `engine.loadWasmModule()`.

If you are constructing views manually using `byteOffset`:

```ts
// ✅ byteOffset 0 — always aligned
const f32 = new Float32Array(view.buffer, view.byteOffset, view.byteLength / 4)

// ❌ byteOffset 2 — not 4-byte aligned, will throw for Float32Array
const bad = new Float32Array(view.buffer, view.byteOffset + 2, ...)
```

When defining a multi-field struct layout in a region, pad fields so each is aligned to its own size. A common pattern for a `Vec3` followed by a `u32` flag:

```
offset 0:  x (f32, 4 bytes)
offset 4:  y (f32, 4 bytes)
offset 8:  z (f32, 4 bytes)
offset 12: flags (u32, 4 bytes)
           ─────────────────
           total: 16 bytes per entity (naturally aligned)
```

---

## Next Steps

- [Building a WASM Plugin](./wasm-plugin) — put shared memory into practice with `engine.loadWasmModule()`
- [Kit Overview](./overview) — understand where shared memory fits in the larger plugin model
