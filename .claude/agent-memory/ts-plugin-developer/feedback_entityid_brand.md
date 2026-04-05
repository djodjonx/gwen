---
name: EntityId brand casting in tests
description: How to create test EntityId stubs when EntityId is a branded bigint type
type: feedback
---

`EntityId` is defined as `bigint & { readonly __brand: unique symbol }`. Plain bigint literals like `1n` are not assignable to `EntityId` — TypeScript rejects them.

**Why:** The branded type prevents accidental entity id mixing, but tests need lightweight stubs.

**How to apply:** In test files, cast with `as unknown as EntityId`:

```ts
import type { EntityId } from '@gwenjs/gwen-engine-core';
const e1 = 1n as unknown as EntityId;
```

Do NOT declare `type EntityId = bigint` locally — that creates a type alias that still fails to satisfy the branded constraint.
