# Physics3D A* Priority Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the O(n²) linear scan in `_localFindPath3D` with a binary min-heap, reducing worst-case A* complexity from O(n²) to O(n log n).

**Architecture:** A private `MinHeap<T>` class is defined at module scope inside the physics3d plugin factory. It replaces the `openArr: OpenEntry[]` array + linear `splice` pattern. The `inOpen` Set is retained to avoid duplicate heap entries. Zero external dependencies.

**Tech Stack:** TypeScript, binary min-heap (inline, ~35 lines).

---

## File Map

| File | Change |
|------|--------|
| `packages/physics3d/src/plugin/index.ts` | Add `MinHeap<T>` class; rewrite `_localFindPath3D` open-set operations |
| `packages/physics3d/tests/gaps.test.ts` | Add heap correctness tests + A* performance regression test |

---

## Task 1: Implement `MinHeap<T>` and replace open-set in `_localFindPath3D`

**Files:**
- Modify: `packages/physics3d/src/plugin/index.ts`

- [ ] **Step 1: Write the failing performance test first**

In `packages/physics3d/tests/gaps.test.ts`, add a test that will be slow with O(n²):

```typescript
describe('Gap 5: A* priority queue', () => {
  it('finds path in large grid within 50ms', () => {
    // 30×1×30 open corridor = 900 cells
    const W = 30, H = 1, D = 30;
    const grid = new Uint8Array(W * H * D); // all zeros = walkable
    physics.initNavGrid3D({ grid, width: W, height: H, depth: D, cellSize: 1 });
    
    const t0 = performance.now();
    const path = physics.findPath3D({ x: 0, y: 0, z: 0 }, { x: 28, y: 0, z: 28 });
    const elapsed = performance.now() - t0;
    
    expect(path.length).toBeGreaterThan(1);
    expect(elapsed).toBeLessThan(50); // must complete in < 50ms
  });
});
```

Run: `pnpm --filter @gwenjs/physics3d test -- --reporter=verbose 2>&1 | grep "A\* priority"`

- [ ] **Step 2: Add `MinHeap<T>` class before the plugin factory**

Find the start of the `createPhysics3DPlugin` factory function. Before it (at module scope), add:

```typescript
/**
 * A generic binary min-heap for A* open sets.
 *
 * Entries are keyed by `priority` (f-score). Equal priorities maintain
 * insertion order (stable). push and pop are both O(log n).
 *
 * @typeParam T - The value type stored alongside each priority.
 *
 * @example
 * ```typescript
 * const heap = new MinHeap<string>();
 * heap.push('b', 10);
 * heap.push('a', 5);
 * heap.pop(); // 'a'
 * ```
 */
class MinHeap<T> {
  private readonly _data: Array<{ priority: number; value: T }> = [];

  /** Number of elements in the heap. */
  get size(): number {
    return this._data.length;
  }

  /**
   * Insert `value` with the given `priority`. O(log n).
   *
   * @param value    - The value to store.
   * @param priority - Lower values are popped first.
   */
  push(value: T, priority: number): void {
    this._data.push({ priority, value });
    this._bubbleUp(this._data.length - 1);
  }

  /**
   * Remove and return the minimum-priority value. O(log n).
   * Returns `undefined` if the heap is empty.
   */
  pop(): T | undefined {
    if (this._data.length === 0) return undefined;
    const top = this._data[0]!.value;
    const last = this._data.pop();
    if (last !== undefined && this._data.length > 0) {
      this._data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  private _bubbleUp(i: number): void {
    const data = this._data;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (data[parent]!.priority <= data[i]!.priority) break;
      [data[parent], data[i]] = [data[i]!, data[parent]!];
      i = parent;
    }
  }

  private _siftDown(i: number): void {
    const data = this._data;
    const n = data.length;
    while (true) {
      let min = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && data[l]!.priority < data[min]!.priority) min = l;
      if (r < n && data[r]!.priority < data[min]!.priority) min = r;
      if (min === i) break;
      [data[i], data[min]] = [data[min]!, data[i]!];
      i = min;
    }
  }
}
```

- [ ] **Step 3: Replace open-set in `_localFindPath3D`**

Locate the block starting at `type OpenEntry = ...` around line 424. Replace the entire open-set implementation with the heap-based version:

```typescript
// ── Replace this block ──────────────────────────────────────────────────────
// type OpenEntry = { f: number; key: CellKey; cx: number; cy: number; cz: number };
// const openArr: OpenEntry[] = [];
// const inOpen = new Set<CellKey>();
// ...
// let minIdx = 0;
// for (let i = 1; i < openArr.length; i++) {
//   if (openArr[i]!.f < openArr[minIdx]!.f) minIdx = i;
// }
// const cur = openArr.splice(minIdx, 1)[0]!;
// inOpen.delete(cur.key);
// ── With this ───────────────────────────────────────────────────────────────
type OpenEntry = { key: CellKey; cx: number; cy: number; cz: number };
const heap = new MinHeap<OpenEntry>();
const inOpen = new Set<CellKey>();
const closed = new Set<CellKey>();

const startKey = `${sx},${sy},${sz}`;
gScore.set(startKey, 0);
const h0 = Math.abs(sx - gx) + Math.abs(sy - gy) + Math.abs(sz - gz);
heap.push({ key: startKey, cx: sx, cy: sy, cz: sz }, h0);
inOpen.add(startKey);

const MAX_ITER = 4096;
let found = false;

for (let iter = 0; iter < MAX_ITER && heap.size > 0; iter++) {
  const cur = heap.pop()!;
  // Stale entry check: if a better path has been found since this was pushed, skip
  if (closed.has(cur.key)) continue;
  inOpen.delete(cur.key);
  closed.add(cur.key);

  if (cur.key === goalKey) { found = true; break; }

  const nb6: [number, number, number][] = [
    [cur.cx + 1, cur.cy, cur.cz], [cur.cx - 1, cur.cy, cur.cz],
    [cur.cx, cur.cy + 1, cur.cz], [cur.cx, cur.cy - 1, cur.cz],
    [cur.cx, cur.cy, cur.cz + 1], [cur.cx, cur.cy, cur.cz - 1],
  ];
  const curG = gScore.get(cur.key) ?? 0;

  for (const [nx, ny, nz] of nb6) {
    if (!isWalkable(nx, ny, nz)) continue;
    const nk = `${nx},${ny},${nz}`;
    if (closed.has(nk)) continue;
    const tentG = curG + 1;
    if (tentG < (gScore.get(nk) ?? Infinity)) {
      gScore.set(nk, tentG);
      cameFrom.set(nk, cur.key);
      const h = Math.abs(nx - gx) + Math.abs(ny - gy) + Math.abs(nz - gz);
      // Push new entry even if key is in open — stale entries are skipped on pop
      heap.push({ key: nk, cx: nx, cy: ny, cz: nz }, tentG + h);
      inOpen.add(nk);
    }
  }
}
```

Note: The `inOpen` Set is retained to allow the `update` deduplication, but the main correctness guarantee is the `closed.has(cur.key)` stale check on pop.

- [ ] **Step 4: Run performance test**

```bash
pnpm --filter @gwenjs/physics3d test -- --reporter=verbose 2>&1 | grep -E "A\*|priority|findPath"
```
Expected: test passes in < 50ms.

- [ ] **Step 5: Run full test suite**

```bash
pnpm --filter @gwenjs/physics3d test
```
Expected: all tests pass (no regressions).

---

## Task 2: Add `MinHeap` unit tests

**Files:**
- Modify: `packages/physics3d/tests/gaps.test.ts`

- [ ] **Step 1: Add MinHeap unit tests**

Since `MinHeap` is defined at module scope, it's not directly exported. Test it indirectly via `findPath3D` behavior, and also add a direct test by exporting it (or testing by proxy).

Add to `gaps.test.ts`:

```typescript
describe('MinHeap via _localFindPath3D', () => {
  it('returns correct ordered path on 5×1×1 corridor', () => {
    const grid = new Uint8Array(5); // all walkable
    physics.initNavGrid3D({ grid, width: 5, height: 1, depth: 1, cellSize: 1 });
    const path = physics.findPath3D({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
    // Path goes from x=0 to x=4, waypoints in order
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]!.x).toBeCloseTo(0, 0);
    expect(path[path.length - 1]!.x).toBeCloseTo(4, 0);
  });

  it('navigates around a wall in 5×1×5 grid', () => {
    const W = 5, H = 1, D = 5;
    const grid = new Uint8Array(W * H * D);
    // Wall at x=2 for z=0..3
    for (let z = 0; z < 4; z++) grid[2 + 0 * W + z * W * H] = 1;
    physics.initNavGrid3D({ grid, width: W, height: H, depth: D, cellSize: 1 });
    const path = physics.findPath3D({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
    // Must find a path around the wall
    expect(path.length).toBeGreaterThan(2);
    // No waypoint should be on the wall (x=2, z=0..3)
    for (const wp of path) {
      const wallCell = Math.round(wp.x) === 2 && Math.round(wp.z) < 4;
      expect(wallCell).toBe(false);
    }
  });

  it('returns direct fallback when no path exists', () => {
    const W = 3, H = 1, D = 3;
    const grid = new Uint8Array(W * H * D);
    // Completely surround start with walls
    grid[1 + 0 * W + 0 * W * H] = 1; // x=1,z=0
    grid[0 + 0 * W + 1 * W * H] = 1; // x=0,z=1
    grid[1 + 0 * W + 1 * W * H] = 1; // x=1,z=1 (target) — also blocked
    physics.initNavGrid3D({ grid, width: W, height: H, depth: D, cellSize: 1 });
    const path = physics.findPath3D({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 2 });
    // Fallback: 2 waypoints
    expect(path.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @gwenjs/physics3d test
```
Expected: all pass.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter '@gwenjs/physics3d' exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/physics3d/src/plugin/index.ts packages/physics3d/tests/gaps.test.ts
git commit -m "perf(physics3d): replace O(n²) A* open-set scan with binary min-heap O(n log n)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
```
