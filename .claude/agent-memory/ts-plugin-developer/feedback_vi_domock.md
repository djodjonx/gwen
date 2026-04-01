---
name: vi.doMock cannot override hoisted vi.mock
description: Pattern for switching WASM bridge variants within a single test file
type: feedback
---

`vi.doMock` cannot override a module that was already imported via a hoisted `vi.mock` at the top of the test file. The module binding is already resolved at import time.

**Why:** Vitest hoists `vi.mock` calls before module imports. `vi.doMock` only affects future dynamic imports, not the static import already at the top of the file.

**How to apply:** When a test suite already has a top-level `vi.mock` for `@djodjonx/gwen-engine-core`, and a sub-test needs a different bridge variant (e.g. local mode instead of WASM mode), use `mockReturnValueOnce` on the existing mock object:

```ts
mockBridge.getPhysicsBridge.mockReturnValueOnce({
  physics3d_init: vi.fn(),
  physics3d_step: vi.fn(),
  // no physics3d_add_body — forces local mode
} as any);
```

This avoids the need for `vi.doMock` and keeps the existing module binding intact.
