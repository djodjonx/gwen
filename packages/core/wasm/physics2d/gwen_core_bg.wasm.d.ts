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
export const engine_physics_init: (a: number, b: number, c: number, d: number) => void;
export const engine_physics_step: (a: number, b: number) => void;
export const engine_physics_set_quality: (a: number, b: number) => void;
export const engine_physics_set_event_coalescing: (a: number, b: number) => void;
export const engine_physics_add_rigid_body: (
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
export const engine_physics_remove_rigid_body: (a: number, b: number) => void;
export const engine_physics_add_box_collider: (
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
) => void;
export const engine_physics_add_ball_collider: (
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
) => void;
export const engine_physics_get_position: (a: number, b: number, c: number) => void;
export const engine_physics_get_linear_velocity: (a: number, b: number, c: number) => void;
export const engine_physics_get_sensor_state: (a: number, b: number, c: number, d: number) => void;
export const engine_physics_update_sensor_state: (
  a: number,
  b: number,
  c: number,
  d: number,
) => void;
export const engine_physics_consume_event_metrics: (a: number, b: number) => void;
export const engine_physics_get_collision_events_ptr: (a: number) => number;
export const engine_physics_get_collision_event_count: (a: number) => number;
export const engine_path_find_2d: (a: number, b: number, c: number, d: number, e: number) => number;
export const engine_path_get_result_ptr: (a: number) => number;
export const engine_stats: (a: number, b: number) => void;
export const get_collision_events_ptr: () => number;
export const get_path_buffer_ptr: () => number;
export const find_path_2d: (a: number, b: number, c: number, d: number) => number;
export const get_collision_event_count: () => number;
export const engine_remove_entity_from_query: (a: number, b: number) => void;
export const engine_physics_set_global_ccd_enabled: (a: number, b: number) => void;
export const __wbindgen_export: (a: number, b: number) => number;
export const __wbindgen_add_to_stack_pointer: (a: number) => number;
export const __wbindgen_export2: (a: number, b: number, c: number) => void;
