//! Unit tests for PhysicsWorld — no wasm-bindgen, pure Rust.

use gwen_physics2d::components::{
    BodyOptions, BodyType, ColliderOptions, CollisionGroups, PhysicsMaterial,
};
use gwen_physics2d::world::{PhysicsCollisionEvent, PhysicsQualityPreset, PhysicsWorld};

// ─── Helper ──────────────────────────────────────────────────────────────────

fn world_with_gravity() -> PhysicsWorld {
    PhysicsWorld::new(0.0, -9.81)
}

fn ev(entity_a: u32, entity_b: u32, started: bool) -> PhysicsCollisionEvent {
    PhysicsCollisionEvent {
        entity_a,
        entity_b,
        collider_a_id: None,
        collider_b_id: None,
        started,
    }
}

// ─── Body management ─────────────────────────────────────────────────────────

#[test]
fn test_add_dynamic_body() {
    let mut w = world_with_gravity();
    let handle = w.add_rigid_body(0, 0.0, 10.0, BodyType::Dynamic, BodyOptions::default());
    assert!(w.entity_to_body.contains_key(&0));
    assert!(w.body_to_entity.values().any(|&e| e == 0));
    // handle is a raw u32 — just assert it's a valid-looking value
    let _ = handle;
}

#[test]
fn test_add_static_body() {
    let mut w = world_with_gravity();
    w.add_rigid_body(1, 0.0, 0.0, BodyType::Fixed, BodyOptions::default());
    assert!(w.entity_to_body.contains_key(&1));
}

#[test]
fn test_add_kinematic_body() {
    let mut w = world_with_gravity();
    w.add_rigid_body(2, 5.0, 5.0, BodyType::Kinematic, BodyOptions::default());
    assert!(w.entity_to_body.contains_key(&2));
}

#[test]
fn test_remove_body_cleans_maps() {
    let mut w = world_with_gravity();
    w.add_rigid_body(10, 0.0, 0.0, BodyType::Dynamic, BodyOptions::default());
    assert!(w.entity_to_body.contains_key(&10));
    w.remove_rigid_body(10);
    assert!(!w.entity_to_body.contains_key(&10));
    // body_to_entity must also be clean
    assert!(!w.body_to_entity.values().any(|&e| e == 10));
}

#[test]
fn test_remove_nonexistent_body_is_noop() {
    let mut w = world_with_gravity();
    // Should not panic
    w.remove_rigid_body(999);
}

#[test]
fn test_add_body_replaces_existing() {
    let mut w = world_with_gravity();
    w.add_rigid_body(5, 0.0, 0.0, BodyType::Dynamic, BodyOptions::default());
    let body_count_before = w.entity_to_body.len();
    w.add_rigid_body(5, 1.0, 1.0, BodyType::Fixed, BodyOptions::default()); // same entity_index
    // Must not duplicate
    assert_eq!(w.entity_to_body.len(), body_count_before);
}

// ─── Simulation ──────────────────────────────────────────────────────────────

#[test]
fn test_step_moves_dynamic_body_downward() {
    let mut w = world_with_gravity();
    w.add_rigid_body(0, 0.0, 10.0, BodyType::Dynamic, BodyOptions::default());

    let (_, y0, _) = w.get_position(0).unwrap();
    // Step a few frames — gravity should pull it down
    for _ in 0..10 {
        w.step(1.0 / 60.0);
    }
    let (_, y1, _) = w.get_position(0).unwrap();
    assert!(y1 < y0, "dynamic body should fall: y0={y0} y1={y1}");
}

#[test]
fn test_static_body_does_not_move() {
    let mut w = world_with_gravity();
    w.add_rigid_body(0, 0.0, 0.0, BodyType::Fixed, BodyOptions::default());

    let (x0, y0, r0) = w.get_position(0).unwrap();
    for _ in 0..60 {
        w.step(1.0 / 60.0);
    }
    let (x1, y1, r1) = w.get_position(0).unwrap();
    assert!((x1 - x0).abs() < 1e-5, "static body x moved");
    assert!((y1 - y0).abs() < 1e-5, "static body y moved");
    assert!((r1 - r0).abs() < 1e-5, "static body rotated");
}

#[test]
fn test_zero_gravity_does_not_move_dynamic_body() {
    let mut w = PhysicsWorld::new(0.0, 0.0);
    w.add_rigid_body(0, 3.0, 3.0, BodyType::Dynamic, BodyOptions::default());
    let (x0, y0, _) = w.get_position(0).unwrap();
    for _ in 0..30 {
        w.step(1.0 / 60.0);
    }
    let (x1, y1, _) = w.get_position(0).unwrap();
    assert!(
        (x1 - x0).abs() < 0.01,
        "x should not drift without gravity/forces"
    );
    assert!(
        (y1 - y0).abs() < 0.01,
        "y should not drift without gravity/forces"
    );
}

#[test]
fn test_100_bodies_step_no_nan() {
    let mut w = world_with_gravity();
    for i in 0..100u32 {
        w.add_rigid_body(
            i,
            i as f32 * 2.0,
            50.0,
            BodyType::Dynamic,
            BodyOptions::default(),
        );
    }
    for _ in 0..10 {
        w.step(1.0 / 60.0);
    }
    for i in 0..100u32 {
        let (x, y, rot) = w.get_position(i).unwrap();
        assert!(!x.is_nan(), "x is NaN for entity {i}");
        assert!(!y.is_nan(), "y is NaN for entity {i}");
        assert!(!rot.is_nan(), "rot is NaN for entity {i}");
    }
}

#[test]
fn test_apply_impulse_changes_velocity() {
    let mut w = PhysicsWorld::new(0.0, 0.0);
    let h = w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic, BodyOptions::default());
    // A collider is required for Rapier to compute mass and simulate the body
    w.add_ball_collider(h, 1.0, ColliderOptions::default());
    w.apply_impulse(0, 100.0, 0.0);
    for _ in 0..10 {
        w.step(1.0 / 60.0);
    }
    let (x1, _, _) = w.get_position(0).unwrap();
    assert!(
        x1 > 0.01,
        "impulse should move body in +x direction, got x={x1}"
    );
}

#[test]
fn test_apply_impulse_on_fixed_body_is_noop() {
    let mut w = PhysicsWorld::new(0.0, 0.0);
    w.add_rigid_body(0, 0.0, 0.0, BodyType::Fixed, BodyOptions::default());
    w.apply_impulse(0, 100.0, 0.0); // Should not panic
    w.step(1.0 / 60.0);
    let (x, y, _) = w.get_position(0).unwrap();
    assert!((x).abs() < 1e-5, "fixed body should not move from impulse");
    assert!((y).abs() < 1e-5);
}

// ─── Collision events ─────────────────────────────────────────────────────────

#[test]
fn test_collision_events_empty_initially() {
    let w = world_with_gravity();
    assert!(w.collision_events.is_empty());
}

#[test]
fn test_event_coalescing_normalizes_pair_order_and_dedups() {
    let mut w = world_with_gravity();
    w.debug_ingest_collision_events(vec![ev(9, 3, true), ev(3, 9, true), ev(9, 3, false)]);

    assert_eq!(w.collision_events.len(), 2);
    assert_eq!(w.collision_events[0].entity_a, 3);
    assert_eq!(w.collision_events[0].entity_b, 9);
    assert!(w.collision_events[0].started);
    assert!(!w.collision_events[1].started);
}

#[test]
fn test_event_coalescing_can_be_disabled() {
    let mut w = world_with_gravity();
    w.set_event_coalescing(false);
    w.debug_ingest_collision_events(vec![ev(9, 3, true), ev(3, 9, true)]);

    assert_eq!(w.collision_events.len(), 2);
}

#[test]
fn test_critical_events_are_prioritized_under_capacity_pressure() {
    let mut w = world_with_gravity();
    w.debug_ingest_collision_events(vec![ev(1, 2, false), ev(5, 6, true), ev(7, 8, false), ev(3, 4, true)]);

    let (selected, dropped_critical, dropped_noncritical) = w.debug_select_events_for_capacity(2);
    assert_eq!(selected.len(), 2);
    assert!(selected.iter().all(|event| event.started));
    assert_eq!(dropped_critical, 0);
    assert_eq!(dropped_noncritical, 2);
}

#[test]
fn test_consume_event_metrics_reports_and_resets_drops() {
    // debug_select_events_for_capacity is a pure read helper — it does NOT mutate
    // the internal drop counters. Only write_events_to_buffer updates them.
    // This test verifies:
    //   1. select helper returns correct drop counts without side effects.
    //   2. consume_event_metrics returns correct state and resets on second call.
    let mut w = world_with_gravity();
    w.debug_ingest_collision_events(vec![ev(1, 2, false), ev(3, 4, true), ev(5, 6, false)]);

    // Pure helper — capacity of 1 keeps the 1 critical, drops 1 critical-none (none here) and 2 non-critical.
    // With 3 events: 1 started, 2 not-started. capacity=1 → select 1 critical, drop 0 critical + 2 non-critical.
    let (selected, dropped_critical, dropped_noncritical) = w.debug_select_events_for_capacity(1);
    assert_eq!(selected.len(), 1);
    assert!(selected[0].started, "selected event must be the critical (started) one");
    assert_eq!(dropped_critical, 0, "no critical events should be dropped");
    assert_eq!(dropped_noncritical, 2, "two non-critical events should be dropped");

    // Internal counters are NOT mutated by the debug helper.
    let metrics = w.consume_event_metrics();
    assert_eq!(metrics.dropped_critical, 0, "debug helper must not mutate metrics state");
    assert_eq!(metrics.dropped_noncritical, 0, "debug helper must not mutate metrics state");
    assert!(metrics.coalesced, "coalescing should be enabled by default");
    assert_eq!(metrics.frame, 0, "frame counter starts at 0");

    // Second call after consume_event_metrics always returns zeroed counters.
    let metrics_after_reset = w.consume_event_metrics();
    assert_eq!(metrics_after_reset.dropped_critical, 0);
    assert_eq!(metrics_after_reset.dropped_noncritical, 0);
}

#[test]
fn test_event_buffer_capacity_grows_and_can_shrink() {
    let mut w = world_with_gravity();
    let initial_capacity = w.debug_staged_events_capacity();

    let many_events = (0..512u32)
        .map(|i| ev(i, i + 1, i % 2 == 0))
        .collect();
    w.debug_ingest_collision_events(many_events);
    let grown_capacity = w.debug_staged_events_capacity();
    assert!(grown_capacity >= initial_capacity);

    w.debug_ingest_collision_events(vec![ev(1, 2, true)]);
    let shrunk_capacity = w.debug_staged_events_capacity();
    assert!(shrunk_capacity <= grown_capacity);
}

// ─── Colliders ────────────────────────────────────────────────────────────────

#[test]
fn test_add_box_collider_does_not_panic() {
    let mut w = world_with_gravity();
    let h = w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic, BodyOptions::default());
    w.add_box_collider(h, 1.0, 1.0, ColliderOptions::default()); // should not panic
}

#[test]
fn test_add_ball_collider_does_not_panic() {
    let mut w = world_with_gravity();
    let h = w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic, BodyOptions::default());
    w.add_ball_collider(h, 0.5, ColliderOptions::default());
}

// ─── get_position ─────────────────────────────────────────────────────────────

#[test]
fn test_get_position_returns_none_for_unknown_entity() {
    let w = world_with_gravity();
    assert!(w.get_position(42).is_none());
}

#[test]
fn test_get_position_initial_matches_spawn() {
    let mut w = world_with_gravity();
    w.add_rigid_body(0, 3.0, 7.0, BodyType::Fixed, BodyOptions::default());
    let (x, y, _) = w.get_position(0).unwrap();
    assert!((x - 3.0).abs() < 1e-4, "x mismatch: {x}");
    assert!((y - 7.0).abs() < 1e-4, "y mismatch: {y}");
}

// ─── Stats JSON ───────────────────────────────────────────────────────────────

#[test]
fn test_stats_json_valid() {
    let mut w = world_with_gravity();
    w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic, BodyOptions::default());
    let json = w.stats_json();
    assert!(json.contains("bodies"), "json={json}");
    assert!(json.contains("colliders"), "json={json}");
}

// ─── Collision layers / masks (Sprint 3) ─────────────────────────────────────

#[test]
fn test_collision_groups_default_is_all() {
    let g = CollisionGroups::default();
    assert_eq!(g.membership, u32::MAX);
    assert_eq!(g.filter, u32::MAX);
}

#[test]
fn test_collision_groups_none_is_zero() {
    assert_eq!(CollisionGroups::NONE.membership, 0);
    assert_eq!(CollisionGroups::NONE.filter, 0);
}

#[test]
fn test_collision_groups_all_is_max() {
    assert_eq!(CollisionGroups::ALL.membership, u32::MAX);
    assert_eq!(CollisionGroups::ALL.filter, u32::MAX);
}

#[test]
fn test_add_box_collider_with_custom_groups_does_not_panic() {
    let mut w = world_with_gravity();
    let h = w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic, BodyOptions::default());
    w.add_box_collider(
        h,
        1.0,
        1.0,
        ColliderOptions {
            groups: CollisionGroups {
                membership: 0b0001, // layer 0 only
                filter: 0b0110,     // collides with layers 1 and 2
            },
            ..ColliderOptions::default()
        },
    );
    // If we get here without panic, the Rapier InteractionGroups conversion worked.
    assert!(w.entity_to_body.contains_key(&0));
}

#[test]
fn test_add_ball_collider_with_custom_groups_does_not_panic() {
    let mut w = world_with_gravity();
    let h = w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic, BodyOptions::default());
    w.add_ball_collider(
        h,
        0.5,
        ColliderOptions {
            groups: CollisionGroups {
                membership: 0b1000_0000_0000_0000_0000_0000_0000_0000, // bit 31
                filter: u32::MAX,
            },
            ..ColliderOptions::default()
        },
    );
    assert!(w.entity_to_body.contains_key(&0));
}

#[test]
fn test_collision_groups_membership_filter_matrix() {
    // Verify the bitwise intersection semantics expected by the TS registry.
    let player_layer = 1u32 << 1; // bit 1
    let enemy_layer = 1u32 << 2;  // bit 2
    let ground_layer = 1u32 << 3; // bit 3

    // Player: member of player_layer, collides with enemy + ground
    let player = CollisionGroups {
        membership: player_layer,
        filter: enemy_layer | ground_layer,
    };

    // Ground: member of ground_layer, collides with everything
    let ground = CollisionGroups {
        membership: ground_layer,
        filter: u32::MAX,
    };

    // Enemy: member of enemy_layer, collides with player only
    let enemy = CollisionGroups {
        membership: enemy_layer,
        filter: player_layer,
    };

    // player ↔ ground: both directions satisfied
    assert_ne!(player.membership & ground.filter, 0);
    assert_ne!(ground.membership & player.filter, 0);

    // player ↔ enemy: both directions satisfied
    assert_ne!(player.membership & enemy.filter, 0);
    assert_ne!(enemy.membership & player.filter, 0);

    // enemy ↔ ground: enemy does NOT want to collide with ground
    assert_eq!(enemy.membership & ground.filter, enemy.membership); // ground accepts enemy
    assert_eq!(ground.membership & enemy.filter, 0); // enemy's filter excludes ground
}

#[test]
fn test_tilemap_chunk_body_can_load_and_unload() {
    let mut w = world_with_gravity();
    let raw = w.load_tilemap_chunk_body(123, 0x8000_007b, 3.0, 4.0);
    assert_ne!(raw, u32::MAX);

    w.add_box_collider(
        raw,
        0.5,
        0.25,
        ColliderOptions {
            offset_x: 1.0,
            offset_y: 2.0,
            ..ColliderOptions::default()
        },
    );
    assert!(w.body_to_entity.values().any(|&entity| entity == 0x8000_007b));

    w.unload_tilemap_chunk_body(123);
    assert!(!w.body_to_entity.values().any(|&entity| entity == 0x8000_007b));
}

#[test]
fn test_physics_material_presets_are_stable() {
    assert_eq!(PhysicsMaterial::DEFAULT.friction, 0.5);
    assert_eq!(PhysicsMaterial::DEFAULT.restitution, 0.0);

    assert_eq!(PhysicsMaterial::ICE.friction, 0.02);
    assert_eq!(PhysicsMaterial::ICE.restitution, 0.0);

    assert_eq!(PhysicsMaterial::RUBBER.friction, 1.2);
    assert_eq!(PhysicsMaterial::RUBBER.restitution, 0.85);
}

#[test]
fn test_quality_preset_updates_solver_and_ccd_parameters() {
    let mut w = world_with_gravity();

    w.set_quality_preset(PhysicsQualityPreset::Low);
    let low_stats = w.stats_json();
    assert!(low_stats.contains("\"qualityPreset\":0"));
    assert!(low_stats.contains("\"solverIterations\":2"));
    assert!(low_stats.contains("\"ccdSubsteps\":1"));

    w.set_quality_preset(PhysicsQualityPreset::Esport);
    let esport_stats = w.stats_json();
    assert!(esport_stats.contains("\"qualityPreset\":3"));
    assert!(esport_stats.contains("\"solverIterations\":10"));
    assert!(esport_stats.contains("\"ccdSubsteps\":4"));
}
