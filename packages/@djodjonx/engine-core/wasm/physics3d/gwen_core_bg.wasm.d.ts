/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_jsentityid_free: (a: number, b: number) => void;
export const jsentityid_index: (a: number) => number;
export const jsentityid_generation: (a: number) => number;
export const __wbg_engine_free: (a: number, b: number) => void;
export const engine_new: (a: number) => number;
export const engine_create_entity: (a: number) => number;
export const engine_delete_entity: (a: number, b: number, c: number) => number;
export const engine_count_entities: (a: number) => number;
export const engine_is_alive: (a: number, b: number, c: number) => number;
export const engine_register_component_type: (a: number) => number;
export const engine_add_component: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
) => number;
export const engine_remove_component: (a: number, b: number, c: number, d: number) => number;
export const engine_has_component: (a: number, b: number, c: number, d: number) => number;
export const engine_get_component_raw: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
) => void;
export const engine_update_entity_archetype: (a: number, b: number, c: number, d: number) => void;
export const engine_remove_entity_from_query: (a: number, b: number) => void;
export const engine_get_entity_generation: (a: number, b: number) => number;
export const engine_query_entities: (a: number, b: number, c: number, d: number) => void;
export const engine_query_entities_to_buffer: (a: number, b: number, c: number) => number;
export const engine_get_query_result_ptr: (a: number) => number;
export const engine_tick: (a: number, b: number) => void;
export const engine_frame_count: (a: number) => bigint;
export const engine_delta_time: (a: number) => number;
export const engine_total_time: (a: number) => number;
export const engine_should_sleep: (a: number) => number;
export const engine_sleep_time_ms: (a: number) => number;
export const engine_reset_frame: (a: number) => void;
export const engine_alloc_shared_buffer: (a: number, b: number) => number;
export const engine_sync_transforms_to_buffer: (a: number, b: number, c: number) => void;
export const engine_sync_transforms_from_buffer: (a: number, b: number, c: number) => void;
export const engine_sync_transforms_to_buffer_sparse: (a: number, b: number) => number;
export const engine_dirty_transform_count: (a: number) => number;
export const engine_physics3d_init: (a: number, b: number, c: number, d: number, e: number) => void;
export const engine_physics3d_step: (a: number, b: number) => void;
export const engine_physics3d_add_body: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
) => number;
export const engine_physics3d_remove_body: (a: number, b: number) => number;
export const engine_physics3d_has_body: (a: number, b: number) => number;
export const engine_physics3d_get_body_state: (a: number, b: number, c: number) => void;
export const engine_physics3d_set_body_state: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  j: number,
  k: number,
  l: number,
  m: number,
  n: number,
  o: number,
) => number;
export const engine_physics3d_get_linear_velocity: (a: number, b: number, c: number) => void;
export const engine_physics3d_set_linear_velocity: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
) => number;
export const engine_physics3d_get_angular_velocity: (a: number, b: number, c: number) => void;
export const engine_physics3d_set_angular_velocity: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
) => number;
export const engine_physics3d_apply_impulse: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
) => number;
export const engine_physics3d_get_body_kind: (a: number, b: number) => number;
export const engine_physics3d_set_body_kind: (a: number, b: number, c: number) => number;
export const engine_physics3d_add_box_collider: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  j: number,
  k: number,
  l: number,
  m: number,
  n: number,
) => number;
export const engine_physics3d_add_sphere_collider: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  j: number,
  k: number,
  l: number,
) => number;
export const engine_physics3d_add_capsule_collider: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  j: number,
  k: number,
  l: number,
  m: number,
) => number;
export const engine_physics3d_remove_collider: (a: number, b: number, c: number) => number;
export const engine_physics3d_set_kinematic_position: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
) => number;
export const engine_physics3d_apply_angular_impulse: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
) => number;
export const engine_physics3d_get_sensor_state: (a: number, b: number, c: number) => bigint;
export const engine_physics3d_update_sensor_state: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
) => void;
export const engine_physics3d_set_quality: (a: number, b: number) => void;
export const engine_physics3d_set_event_coalescing: (a: number, b: number) => void;
export const engine_physics3d_get_collision_events_ptr: (a: number) => number;
export const engine_physics3d_get_collision_event_count: (a: number) => number;
export const engine_physics3d_consume_events: (a: number) => void;
export const engine_stats: (a: number, b: number) => void;
export const __wbindgen_export: (a: number, b: number) => number;
export const __wbindgen_add_to_stack_pointer: (a: number) => number;
export const __wbindgen_export2: (a: number, b: number, c: number) => void;
