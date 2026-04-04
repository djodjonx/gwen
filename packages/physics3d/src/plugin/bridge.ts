/**
 * Internal raw event read from the WASM ring buffer.
 * Carries slot indices not exposed on the public `Physics3DCollisionContact`.
 */
export type InternalCollisionEvent3D = {
  slotA: number;
  slotB: number;
  aColliderId: number | undefined;
  bColliderId: number | undefined;
  started: boolean;
};

/** WASM exports available in the physics3d variant. */
export interface Physics3DWasmBridge {
  // World lifecycle
  physics3d_init?: (gx: number, gy: number, gz: number, maxEntities: number) => void;
  physics3d_step?: (delta: number) => void;
  physics3d_set_quality?: (preset: number) => void;
  physics3d_set_event_coalescing?: (enabled: number) => void;

  // Body lifecycle
  physics3d_add_body?: (
    entityIndex: number,
    x: number,
    y: number,
    z: number,
    kind: number,
    mass: number,
    linearDamping: number,
    angularDamping: number,
  ) => boolean;
  physics3d_remove_body?: (entityIndex: number) => boolean;
  physics3d_has_body?: (entityIndex: number) => boolean;

  // State read/write — Float32Array layout: [px,py,pz, qx,qy,qz,qw, vx,vy,vz, ax,ay,az]
  physics3d_get_body_state?: (entityIndex: number) => Float32Array;
  physics3d_set_body_state?: (
    entityIndex: number,
    px: number,
    py: number,
    pz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
    vx: number,
    vy: number,
    vz: number,
    ax: number,
    ay: number,
    az: number,
  ) => boolean;

  // Velocity
  physics3d_get_linear_velocity?: (entityIndex: number) => Float32Array;
  physics3d_set_linear_velocity?: (
    entityIndex: number,
    vx: number,
    vy: number,
    vz: number,
  ) => boolean;
  physics3d_get_angular_velocity?: (entityIndex: number) => Float32Array;
  physics3d_set_angular_velocity?: (
    entityIndex: number,
    ax: number,
    ay: number,
    az: number,
  ) => boolean;

  // Impulse
  physics3d_apply_impulse?: (entityIndex: number, ix: number, iy: number, iz: number) => boolean;
  physics3d_apply_angular_impulse?: (
    entityIndex: number,
    ix: number,
    iy: number,
    iz: number,
  ) => boolean;

  // Body kind
  physics3d_get_body_kind?: (entityIndex: number) => number;
  physics3d_set_body_kind?: (entityIndex: number, kind: number) => boolean;

  // Kinematic positioning
  physics3d_set_kinematic_position?: (
    entityIndex: number,
    px: number,
    py: number,
    pz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
  ) => boolean;

  // Collider management
  physics3d_add_box_collider?: (
    entityIndex: number,
    halfX: number,
    halfY: number,
    halfZ: number,
    friction: number,
    restitution: number,
    density: number,
    isSensor: number,
    membership: number,
    filter: number,
    colliderId: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ) => boolean;
  physics3d_add_sphere_collider?: (
    entityIndex: number,
    radius: number,
    friction: number,
    restitution: number,
    density: number,
    isSensor: number,
    membership: number,
    filter: number,
    colliderId: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ) => boolean;
  physics3d_add_capsule_collider?: (
    entityIndex: number,
    radius: number,
    halfHeight: number,
    friction: number,
    restitution: number,
    density: number,
    isSensor: number,
    membership: number,
    filter: number,
    colliderId: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ) => boolean;
  physics3d_add_heightfield_collider?: (
    entityIndex: number,
    heightsFlat: Float32Array,
    rows: number,
    cols: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ) => boolean;
  physics3d_update_heightfield_collider?: (
    entityIndex: number,
    colliderId: number,
    heightsFlat: Float32Array,
    rows: number,
    cols: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
  ) => boolean;
  physics3d_add_compound_collider?: (
    entityIndex: number,
    shapeData: Float32Array,
    layerBits: number,
    maskBits: number,
  ) => number;
  physics3d_remove_collider?: (entityIndex: number, colliderId: number) => boolean;
  /**
   * Attach a triangle-mesh collider to a 3D body.
   * Parameter order matches the Rust WASM export exactly.
   */
  physics3d_add_mesh_collider?: (
    entityIndex: number,
    vertices: Float32Array,
    indices: Uint32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: number,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ) => boolean;
  /**
   * Rebuild an existing triangle-mesh collider with new geometry.
   * Removes the old trimesh and inserts a fresh one atomically inside Rapier3D.
   * Parameter order matches the Rust WASM export exactly.
   */
  physics3d_rebuild_mesh_collider?: (
    entityIndex: number,
    colliderId: number,
    vertices: Float32Array,
    indices: Uint32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: boolean,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
  ) => boolean;
  /**
   * Attach a pre-baked BVH triangle-mesh collider to a 3D body.
   * The `bvhBytes` parameter is the raw BVH binary emitted by the Vite plugin.
   * Parameter order matches the Rust WASM export exactly.
   */
  physics3d_load_bvh_collider?: (
    entityIndex: number,
    bvhBytes: Uint8Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: boolean,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ) => boolean;
  /**
   * Attach a convex-hull collider to a 3D body.
   * Falls back to a unit sphere on degenerate input (Rapier-side).
   * Parameter order matches the Rust WASM export exactly.
   */
  physics3d_add_convex_collider?: (
    entityIndex: number,
    vertices: Float32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: number,
    friction: number,
    restitution: number,
    density: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ) => boolean;
  /**
   * Bulk-spawn N static box bodies in one WASM call.
   * `entityIndices` must be pre-allocated by the TypeScript caller.
   */
  physics3d_bulk_spawn_static_boxes?: (
    entityIndices: Uint32Array,
    positionsFlat: Float32Array,
    halfExtentsFlat: Float32Array,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
  ) => number;

  // Sensor
  physics3d_get_sensor_state?: (entityIndex: number, sensorId: number) => BigInt64Array | number[];
  physics3d_update_sensor_state?: (
    entityIndex: number,
    sensorId: number,
    isActive: number,
    count: number,
  ) => void;

  // Collision events
  physics3d_get_collision_events_ptr?: () => number;
  physics3d_get_collision_event_count?: () => number;
  physics3d_consume_events?: () => void;

  // Memory
  memory?: WebAssembly.Memory;
}

/** Minimal bridge runtime shape returned by getWasmBridge(). */
export interface Physics3DBridgeRuntime {
  variant: 'light' | 'physics2d' | 'physics3d';
  getPhysicsBridge(): Physics3DWasmBridge;
  getLinearMemory?(): WebAssembly.Memory | null;
  /** Returns the current generation counter for an entity slot index. */
  getEntityGeneration?(index: number): number | undefined;
}
