//! Unit tests for PhysicsWorld — no wasm-bindgen, pure Rust.

use gwen_plugin_physics2d::components::{BodyType, PhysicsMaterial};
use gwen_plugin_physics2d::world::PhysicsWorld;

// ─── Helper ──────────────────────────────────────────────────────────────────

fn world_with_gravity() -> PhysicsWorld {
    PhysicsWorld::new(0.0, -9.81)
}

fn default_material() -> PhysicsMaterial {
    PhysicsMaterial {
        restitution: 0.0,
        friction: 0.5,
    }
}

// ─── Body management ─────────────────────────────────────────────────────────

#[test]
fn test_add_dynamic_body() {
    let mut w = world_with_gravity();
    let handle = w.add_rigid_body(0, 0.0, 10.0, BodyType::Dynamic);
    assert!(w.entity_to_body.contains_key(&0));
    assert!(w.body_to_entity.values().any(|&e| e == 0));
    // handle is a raw u32 — just assert it's a valid-looking value
    let _ = handle;
}

#[test]
fn test_add_static_body() {
    let mut w = world_with_gravity();
    w.add_rigid_body(1, 0.0, 0.0, BodyType::Fixed);
    assert!(w.entity_to_body.contains_key(&1));
}

#[test]
fn test_add_kinematic_body() {
    let mut w = world_with_gravity();
    w.add_rigid_body(2, 5.0, 5.0, BodyType::Kinematic);
    assert!(w.entity_to_body.contains_key(&2));
}

#[test]
fn test_remove_body_cleans_maps() {
    let mut w = world_with_gravity();
    w.add_rigid_body(10, 0.0, 0.0, BodyType::Dynamic);
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
    w.add_rigid_body(5, 0.0, 0.0, BodyType::Dynamic);
    let body_count_before = w.entity_to_body.len();
    w.add_rigid_body(5, 1.0, 1.0, BodyType::Fixed); // same entity_index
                                                    // Must not duplicate
    assert_eq!(w.entity_to_body.len(), body_count_before);
}

// ─── Simulation ──────────────────────────────────────────────────────────────

#[test]
fn test_step_moves_dynamic_body_downward() {
    let mut w = world_with_gravity();
    w.add_rigid_body(0, 0.0, 10.0, BodyType::Dynamic);

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
    w.add_rigid_body(0, 0.0, 0.0, BodyType::Fixed);

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
    w.add_rigid_body(0, 3.0, 3.0, BodyType::Dynamic);
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
        w.add_rigid_body(i, i as f32 * 2.0, 50.0, BodyType::Dynamic);
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
    let h = w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic);
    // A collider is required for Rapier to compute mass and simulate the body
    w.add_ball_collider(h, 1.0, default_material());
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
    w.add_rigid_body(0, 0.0, 0.0, BodyType::Fixed);
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
fn test_collision_events_json_format_empty() {
    let w = world_with_gravity();
    let json = w.collision_events_json();
    assert_eq!(json, "[]");
}

#[test]
fn test_collision_events_json_format_nonempty() {
    use gwen_plugin_physics2d::world::PhysicsCollisionEvent;
    let mut w = world_with_gravity();
    w.collision_events.push(PhysicsCollisionEvent {
        entity_a: 1,
        entity_b: 2,
        started: true,
    });
    let json = w.collision_events_json();
    assert!(json.contains(r#""a":1"#), "json={json}");
    assert!(json.contains(r#""b":2"#), "json={json}");
    assert!(json.contains(r#""started":true"#), "json={json}");
}

// ─── Colliders ────────────────────────────────────────────────────────────────

#[test]
fn test_add_box_collider_does_not_panic() {
    let mut w = world_with_gravity();
    let h = w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic);
    w.add_box_collider(h, 1.0, 1.0, default_material()); // should not panic
}

#[test]
fn test_add_ball_collider_does_not_panic() {
    let mut w = world_with_gravity();
    let h = w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic);
    w.add_ball_collider(h, 0.5, default_material());
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
    w.add_rigid_body(0, 3.0, 7.0, BodyType::Fixed);
    let (x, y, _) = w.get_position(0).unwrap();
    assert!((x - 3.0).abs() < 1e-4, "x mismatch: {x}");
    assert!((y - 7.0).abs() < 1e-4, "y mismatch: {y}");
}

// ─── Stats JSON ───────────────────────────────────────────────────────────────

#[test]
fn test_stats_json_valid() {
    let mut w = world_with_gravity();
    w.add_rigid_body(0, 0.0, 0.0, BodyType::Dynamic);
    let json = w.stats_json();
    assert!(json.contains("bodies"), "json={json}");
    assert!(json.contains("colliders"), "json={json}");
}
