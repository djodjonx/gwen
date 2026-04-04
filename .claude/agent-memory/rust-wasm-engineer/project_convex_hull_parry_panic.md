---
name: parry3d convex_hull panic on < 4 points
description: parry3d panics with IncompleteInput when convex_hull receives fewer than 4 distinct points — use a pre-check guard before calling it
type: project
---

`ColliderBuilder::convex_hull(&verts)` delegates to parry3d, which panics with
`IncompleteInput` (instead of returning `None`) when given fewer than 4 distinct points.

**Why:** parry3d >= 0.17.x changed internal error handling; the `Option` return only covers
topological failure, not insufficient-point input.

**How to apply:** In `add_convex_collider` (and any future convex-hull based helper),
add `if verts.len() < 4 { ColliderBuilder::ball(0.5) }` _before_ calling `convex_hull`,
then use `unwrap_or_else(|| ColliderBuilder::ball(0.5))` for the >= 4 path.
