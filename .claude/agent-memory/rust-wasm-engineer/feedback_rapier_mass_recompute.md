---
name: Rapier mass recompute quirk
description: Rapier3D (and Rapier2D) defers effective_inv_mass population until the first simulation step, impacting impulse tests for collider-less bodies
type: feedback
---

In Rapier 0.22, calling `RigidBodyBuilder::additional_mass(m)` and then inserting the body sets the `LOCAL_MASS_PROPERTIES` change flag but does NOT immediately populate `effective_inv_mass`. The pipeline's `user_changes` pass processes that flag at the start of the first `step()` call, after which `effective_inv_mass` is non-zero and impulses take effect.

**Why:** Rapier derives mass from attached colliders + additional mass properties in a single recompute call triggered by the pipeline — there is no eager init path for collider-less bodies.

**How to apply:** In tests that create a body without colliders and then immediately call `apply_impulse`, insert one `world.step(1.0/60.0)` call between body creation and the impulse. This also applies to any other caller that reads velocity right after `add_body` but before the first step.
