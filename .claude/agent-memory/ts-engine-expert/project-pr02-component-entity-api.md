---
name: PR-02 Component and Entity API simplification
description: Breaking change — flat EngineAPI ECS methods replaced by api.component.* and api.entity.* namespaces
type: project
---

PR-02 of the GWEN v2 integration playbook was completed on 2026-03-29.

**Why:** Canonical namespaces reduce API surface noise, enforce clearer intent (add vs set), and make the WASM interop surface explicit.

**Changes landed:**

- `schema.ts` — `Types.vec2/vec3/vec4/quat/color` spatial primitives added; `ComponentDefinition.defaults` optional field added; `InferSchemaType` updated; `computeSchemaLayout` handles composite types as packed f32 arrays.
- `types/engine-api.ts` — `ComponentAPI` and `EntityAPI` interfaces added; `EngineAPI` interface exposes `readonly component: ComponentAPI` and `readonly entity: EntityAPI`; flat `createEntity/destroyEntity/entityExists/addComponent/getComponent/hasComponent/removeComponent/getEntityGeneration` removed from the public interface. `EntityAPI.getGeneration()` added for WASM slot-index interop.
- `api/api.ts` — `EngineAPIImpl` implements the namespaces as inline object literals in the constructor (uses `const self = this` pattern because methods are not arrow functions); old flat helpers remain as `@internal` class methods for test compatibility.
- `core/query-result.ts` — `EntityAccessorImpl` and `resolveSystemQueryIds` use `api.component.*`.
- `api/scene.ts` — `purgeEntities` uses `api.entity.destroy(id)`.
- `api/ui.ts` — `UIManager.onRender` uses `api.component.get(id, UIComponent)`.
- `tests/query-system.test.ts` — `makeApiMock` updated to expose `component` and `entity` namespaces instead of flat methods.
- `docs/API.md` — EngineAPI section rewritten; "Canonical Component API" section added with vec3/quat example.

**How to apply:** No `@deprecated` bridges were added. Breaking change is intentional per playbook policy.
