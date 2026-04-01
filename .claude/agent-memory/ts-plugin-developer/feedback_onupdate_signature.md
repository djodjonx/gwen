---
name: Plugin lifecycle onUpdate requires deltaTime
description: The definePlugin class exposes onUpdate(api, deltaTime) — both args required
type: feedback
---

The `definePlugin` base class exposes `onUpdate(api: EngineAPI, deltaTime: number): void` — both arguments are required even if the plugin's internal implementation ignores `deltaTime`.

**Why:** The generated class method signature is fixed and TypeScript enforces it at call sites.

**How to apply:** In tests, always call `plugin.onUpdate(api, 0)` or `plugin.onUpdate(api, deltaSeconds)`. Calling `plugin.onUpdate(api)` will fail typecheck with "Expected 2 arguments, but got 1". Same rule applies to `onBeforeUpdate(api, deltaTime)`.
