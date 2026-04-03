//! Tier 1 bulk ECS operations — pure core, no physics dependency.
//!
//! Combines a query step and a bulk read/write into a single WASM call,
//! eliminating per-entity JS↔WASM boundary crossings.
//!
//! # Overview
//! The typical frame-update pattern without bulk ops requires N separate
//! WASM boundary crossings (one per entity) to read or write component data.
//! At scale this overhead dominates frame time. These functions collapse that
//! into a **single crossing** per read or write pass:
//!
//! ```text
//! JS → WASM: query_read_bulk(component_type_ids, read_type_id, out_slots, out_gens, out_buf)
//!   → fills out_slots / out_gens / out_buf in one call
//! JS mutates out_buf in-place
//! JS → WASM: query_write_bulk(out_slots, out_gens, write_type_id, out_buf)
//!   → one write pass, one crossing
//! ```
//!
//! # Key Types
//! - [`query_read_bulk`] — query + bulk component read in one call.
//! - [`query_write_bulk`] — bulk component write for a previously-queried set.
//! - [`BULK_MAX_ENTITIES`] — hard cap on entities returned per call.

use crate::bindings::Engine;
use crate::ecs::component::ComponentTypeId;

/// Maximum number of entities returned (and processed) by a single bulk call.
///
/// Callers must size their `out_slots` / `out_gens` buffers to at least this
/// many elements to avoid truncation when the live entity count is large.
pub const BULK_MAX_ENTITIES: usize = 10_000;

/// Query entities that have ALL given component types, then bulk-read one component type.
///
/// # Description
/// Iterates all live entities, retains those possessing every component type
/// listed in `component_type_ids`, writes their slot/generation into the
/// output arrays, and then delegates a single `get_components_bulk` call to
/// pack the component data into `out_buf`.
///
/// The caller must pre-allocate `out_slots`, `out_gens`, and `out_buf`; this
/// function never allocates.
///
/// # Arguments
/// * `engine`             – Shared reference to the engine.
/// * `component_type_ids` – Filter: entity must have ALL of these component types.
/// * `read_type_id`       – Which component type's bytes to pack into `out_buf`.
/// * `out_slots`          – Caller buffer for entity slot indices (len ≥ [`BULK_MAX_ENTITIES`]).
/// * `out_gens`           – Caller buffer for entity generations   (len ≥ [`BULK_MAX_ENTITIES`]).
/// * `out_buf`            – Caller byte buffer for packed component data.
///
/// # Returns
/// `(entity_count, bytes_written)` — the number of matching entities found and
/// the number of bytes written into `out_buf`.
///
/// # Examples
/// ```rust
/// # use gwen_core::bindings::Engine;
/// # use gwen_core::bulk_ops::query_read_bulk;
/// let engine = Engine::new(1000);
/// let mut slots = vec![0u32; 10_000];
/// let mut gens  = vec![0u32; 10_000];
/// let mut buf   = vec![0u8;  40_000];
/// let (count, bytes) = query_read_bulk(&engine, &[0], 0, &mut slots, &mut gens, &mut buf);
/// assert_eq!(count, 0); // no entities yet
/// ```
pub fn query_read_bulk(
    engine: &Engine,
    component_type_ids: &[u32],
    read_type_id: u32,
    out_slots: &mut [u32],
    out_gens: &mut [u32],
    out_buf: &mut [u8],
) -> (u32, u32) {
    let entity_count = collect_query_results(engine, component_type_ids, out_slots, out_gens);
    if entity_count == 0 {
        return (0, 0);
    }

    let n = entity_count as usize;
    let bytes_written = engine.get_components_bulk(
        &out_slots[..n],
        &out_gens[..n],
        read_type_id,
        out_buf,
    );

    (entity_count, bytes_written)
}

/// Write component data back for a set of entities in one WASM call.
///
/// # Description
/// The write counterpart to [`query_read_bulk`]. After JS has mutated the
/// component data in-place, call this function with the same `slots` / `gens`
/// arrays and the updated `data` buffer to persist the changes.
///
/// # Arguments
/// * `engine`         – Mutable reference to the engine.
/// * `slots`          – Entity slot indices (from a prior [`query_read_bulk`] call).
/// * `gens`           – Per-slot generation counters (from a prior [`query_read_bulk`] call).
/// * `write_type_id`  – Component type ID to write.
/// * `data`           – Packed component bytes; total length must equal
///   `slots.len() × component_size_bytes`.
///
/// # Examples
/// ```rust
/// # use gwen_core::bindings::Engine;
/// # use gwen_core::bulk_ops::query_write_bulk;
/// let mut engine = Engine::new(1000);
/// // No-op on empty slices — never panics.
/// query_write_bulk(&mut engine, &[], &[], 0, &[]);
/// ```
pub fn query_write_bulk(
    engine: &mut Engine,
    slots: &[u32],
    gens: &[u32],
    write_type_id: u32,
    data: &[u8],
) {
    engine.set_components_bulk(slots, gens, write_type_id, data);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Fills `out_slots` and `out_gens` with alive entities that possess every
/// component type in `component_type_ids`.
///
/// Returns the number of entities written into the output slices.
/// Stops early at `cap = min(out_slots.len(), out_gens.len(), BULK_MAX_ENTITIES)`.
fn collect_query_results(
    engine: &Engine,
    component_type_ids: &[u32],
    out_slots: &mut [u32],
    out_gens: &mut [u32],
) -> u32 {
    // Respect the smaller of the two output buffers and the hard cap.
    let cap = out_slots.len().min(out_gens.len()).min(BULK_MAX_ENTITIES);
    let mut count: usize = 0;

    for entity in engine.entity_manager.iter_entities() {
        if count >= cap {
            break;
        }

        let slot = entity.index();
        let gen = entity.generation();

        // Entity must have every requested component type.
        let matches = component_type_ids.iter().all(|&tid| {
            engine
                .storage
                .get_component(slot, ComponentTypeId::from_raw(tid))
                .is_some()
        });

        if matches {
            out_slots[count] = slot;
            out_gens[count] = gen;
            count += 1;
        }
    }

    count as u32
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bindings::Engine;

    fn make_engine() -> Engine {
        Engine::new(1000)
    }

    // ── query_read_bulk ──────────────────────────────────────────────────────

    #[test]
    fn test_query_read_bulk_empty_engine_returns_zero() {
        let engine = make_engine();
        let mut slots = vec![0u32; 16];
        let mut gens = vec![0u32; 16];
        let mut buf = vec![0u8; 256];
        let (count, bytes) =
            query_read_bulk(&engine, &[0], 0, &mut slots, &mut gens, &mut buf);
        assert_eq!(count, 0, "no entities → count must be 0");
        assert_eq!(bytes, 0, "no entities → bytes_written must be 0");
    }

    #[test]
    fn test_query_read_bulk_no_matching_component_returns_zero() {
        let mut engine = make_engine();
        let t0 = engine.register_component_type();
        let t1 = engine.register_component_type(); // exists but entity won't have it

        let e = engine.create_entity();
        engine.add_component(e.index(), e.generation(), t0, &[1u8, 2, 3, 4]);

        let mut slots = vec![0u32; 16];
        let mut gens = vec![0u32; 16];
        let mut buf = vec![0u8; 64];
        // Filter requires t1, but the entity only has t0.
        let (count, _) =
            query_read_bulk(&engine, &[t1], t0, &mut slots, &mut gens, &mut buf);
        assert_eq!(count, 0);
    }

    // ── query_write_bulk ─────────────────────────────────────────────────────

    #[test]
    fn test_query_write_bulk_no_panic_on_empty_slices() {
        let mut engine = make_engine();
        // Must not panic with empty inputs.
        query_write_bulk(&mut engine, &[], &[], 0, &[]);
    }

    // ── round-trip ───────────────────────────────────────────────────────────

    #[test]
    fn test_query_read_write_roundtrip_three_entities() {
        let mut engine = make_engine();

        // Register a 4-byte component type.
        let type_id = engine.register_component_type();

        // Spawn 3 entities.
        let e0 = engine.create_entity();
        let e1 = engine.create_entity();
        let e2 = engine.create_entity();

        // Seed initial component data: values 1, 2, 3 (little-endian u32).
        let slots_init = [e0.index(), e1.index(), e2.index()];
        let gens_init = [e0.generation(), e1.generation(), e2.generation()];
        let seed = [1u8, 0, 0, 0, 2u8, 0, 0, 0, 3u8, 0, 0, 0];
        engine.set_components_bulk(&slots_init, &gens_init, type_id, &seed);

        // Bulk query + read.
        let mut out_slots = vec![0u32; 16];
        let mut out_gens = vec![0u32; 16];
        let mut out_buf = vec![0u8; 12];

        let (count, bytes) = query_read_bulk(
            &engine,
            &[type_id],
            type_id,
            &mut out_slots,
            &mut out_gens,
            &mut out_buf,
        );

        assert_eq!(count, 3, "should find all 3 entities");
        assert_eq!(bytes, 12, "3 entities × 4 bytes = 12");
        assert_eq!(out_buf[0], 1, "entity 0 byte[0]");
        assert_eq!(out_buf[4], 2, "entity 1 byte[0]");
        assert_eq!(out_buf[8], 3, "entity 2 byte[0]");

        // Mutate first entity's value to 42 and write back.
        out_buf[0] = 42;
        query_write_bulk(
            &mut engine,
            &out_slots[..3],
            &out_gens[..3],
            type_id,
            &out_buf,
        );

        // Verify the mutation was persisted.
        let mut verify = vec![0u8; 12];
        engine.get_components_bulk(&out_slots[..3], &out_gens[..3], type_id, &mut verify);
        assert_eq!(verify[0], 42, "mutation should be persisted");
        assert_eq!(verify[4], 2, "entity 1 unchanged");
        assert_eq!(verify[8], 3, "entity 2 unchanged");
    }

    #[test]
    fn test_query_read_bulk_respects_bulk_max_entities_cap() {
        let mut engine = Engine::new(BULK_MAX_ENTITIES as u32 + 100);
        let type_id = engine.register_component_type();

        // Spawn more entities than the cap.
        for _ in 0..(BULK_MAX_ENTITIES + 50) {
            let e = engine.create_entity();
            engine.add_component(e.index(), e.generation(), type_id, &[0u8; 4]);
        }

        // Use exactly BULK_MAX_ENTITIES-sized output buffers.
        let mut out_slots = vec![0u32; BULK_MAX_ENTITIES];
        let mut out_gens = vec![0u32; BULK_MAX_ENTITIES];
        let mut out_buf = vec![0u8; BULK_MAX_ENTITIES * 4];

        let (count, _) = query_read_bulk(
            &engine,
            &[type_id],
            type_id,
            &mut out_slots,
            &mut out_gens,
            &mut out_buf,
        );

        assert_eq!(
            count, BULK_MAX_ENTITIES as u32,
            "must be capped at BULK_MAX_ENTITIES"
        );
    }

    #[test]
    fn test_query_read_bulk_multi_component_filter() {
        let mut engine = make_engine();
        let t0 = engine.register_component_type();
        let t1 = engine.register_component_type();

        // e0 has both, e1 has only t0.
        let e0 = engine.create_entity();
        let e1 = engine.create_entity();
        engine.add_component(e0.index(), e0.generation(), t0, &[1u8; 4]);
        engine.add_component(e0.index(), e0.generation(), t1, &[2u8; 4]);
        engine.add_component(e1.index(), e1.generation(), t0, &[3u8; 4]);

        let mut slots = vec![0u32; 16];
        let mut gens = vec![0u32; 16];
        let mut buf = vec![0u8; 64];

        // Filter requires BOTH t0 and t1 → only e0 qualifies.
        let (count, bytes) =
            query_read_bulk(&engine, &[t0, t1], t0, &mut slots, &mut gens, &mut buf);

        assert_eq!(count, 1, "only e0 has both components");
        assert_eq!(bytes, 4);
        assert_eq!(slots[0], e0.index());
    }
}
