# Memory Index

- [Rapier mass recompute quirk](feedback_rapier_mass_recompute.md) — Rapier defers effective_inv_mass population until first step; affects test design
- [parry3d convex_hull panic on < 4 points](project_convex_hull_parry_panic.md) — guard with len < 4 check before calling convex_hull; parry panics instead of returning None
- [static_mut_refs pattern](feedback_static_mut_refs_pattern.md) — Use addr_of! + raw dereference instead of &STATIC_MUT to avoid static_mut_refs lint (Rust 1.87+)
