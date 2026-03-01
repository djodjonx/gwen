//! Component storage
//!
//! Stores and retrieves component data using Structure of Arrays (SoA) layout for cache efficiency.

use std::collections::HashMap;
use std::any::TypeId;

/// Unique identifier for a component type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ComponentTypeId(u32);

impl ComponentTypeId {
    /// Get the raw ID value
    pub fn raw(self) -> u32 {
        self.0
    }

    /// Create from raw ID (for testing)
    pub fn from_raw(raw: u32) -> Self {
        ComponentTypeId(raw)
    }
}

/// Registry for component types
pub struct ComponentRegistry {
    next_id: u32,
    type_sizes: HashMap<ComponentTypeId, usize>,
    type_names: HashMap<ComponentTypeId, String>,
    rust_type_ids: HashMap<TypeId, ComponentTypeId>,
}

impl ComponentRegistry {
    /// Create a new component registry
    pub fn new() -> Self {
        ComponentRegistry {
            next_id: 0,
            type_sizes: HashMap::new(),
            type_names: HashMap::new(),
            rust_type_ids: HashMap::new(),
        }
    }

    /// Register a new component type
    pub fn register<T: 'static>(&mut self) -> ComponentTypeId {
        let rust_type_id = TypeId::of::<T>();

        if let Some(&id) = self.rust_type_ids.get(&rust_type_id) {
            return id;
        }

        let id = ComponentTypeId(self.next_id);
        self.next_id += 1;

        self.type_sizes.insert(id, std::mem::size_of::<T>());
        self.type_names.insert(id, std::any::type_name::<T>().to_string());
        self.rust_type_ids.insert(rust_type_id, id);

        id
    }

    /// Get size of component type
    pub fn size(&self, type_id: ComponentTypeId) -> Option<usize> {
        self.type_sizes.get(&type_id).copied()
    }

    /// Get name of component type
    pub fn name(&self, type_id: ComponentTypeId) -> Option<&str> {
        self.type_names.get(&type_id).map(|s| s.as_str())
    }
}

impl Default for ComponentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Stores components of one type.
///
/// Two modes:
///  - **Fixed-size** (Rust native types): `element_size > 0`, strict size check.
///  - **Variable-size** (JS/WASM bridge): `element_size == 0`, each entity
///    has its own blob of arbitrary length (JSON bytes from TypeScript).
///
/// The JS bridge always uses variable-size via `upsert_raw()`.
pub struct ComponentColumn {
    entity_ids: Vec<u32>,
    /// Maps entity_id → slot index in `data` for O(1) access.
    index_map: HashMap<u32, usize>,
    data: Vec<u8>,
    type_id: ComponentTypeId,
    /// Fixed element size (0 = variable-size / JS mode).
    element_size: usize,
    /// Byte offsets per slot — only used in variable-size mode.
    offsets: Vec<(usize, usize)>, // (start, len) per slot
}

impl ComponentColumn {
    /// Create a new component column
    pub fn new(type_id: ComponentTypeId, element_size: usize) -> Self {
        ComponentColumn {
            entity_ids: Vec::new(),
            index_map: HashMap::new(),
            data: Vec::new(),
            type_id,
            element_size,
            offsets: Vec::new(),
        }
    }

    /// Variable-size mode: add **or update** component bytes for an entity.
    /// Used by the JS/WASM bridge where component data is JSON-serialised.
    pub fn upsert_raw(&mut self, entity_id: u32, data: &[u8]) -> bool {
        if let Some(&slot) = self.index_map.get(&entity_id) {
            // Update existing slot
            let (start, _old_len) = self.offsets[slot];
            // Rebuild data vec replacing the old bytes for this slot
            let old_end = start + _old_len;
            let new_len = data.len();
            let delta = new_len as isize - _old_len as isize;

            // Splice data in-place
            let mut new_data = self.data[..start].to_vec();
            new_data.extend_from_slice(data);
            new_data.extend_from_slice(&self.data[old_end..]);
            self.data = new_data;

            // Update offset for this slot
            self.offsets[slot] = (start, new_len);

            // Shift offsets of all slots that come after this one
            if delta != 0 {
                for i in (slot + 1)..self.offsets.len() {
                    self.offsets[i].0 = (self.offsets[i].0 as isize + delta) as usize;
                }
            }
            false // updated, not inserted
        } else {
            // Insert new slot
            let start = self.data.len();
            self.data.extend_from_slice(data);
            let slot = self.entity_ids.len();
            self.index_map.insert(entity_id, slot);
            self.entity_ids.push(entity_id);
            self.offsets.push((start, data.len()));
            true // inserted
        }
    }

    /// Add a component for an entity – O(1) (fixed-size mode).
    pub fn add(&mut self, entity_id: u32, data: &[u8]) -> bool {
        if self.element_size == 0 {
            // Variable-size mode — use upsert
            return self.upsert_raw(entity_id, data);
        }

        if self.index_map.contains_key(&entity_id) {
            // Update in place for fixed-size
            let slot = self.index_map[&entity_id];
            let start = slot * self.element_size;
            self.data[start..start + self.element_size].copy_from_slice(data);
            return false;
        }

        assert_eq!(
            data.len(),
            self.element_size,
            "Data size mismatch for component type {:?}: expected {}, got {}",
            self.type_id, self.element_size, data.len()
        );

        let slot = self.entity_ids.len();
        self.index_map.insert(entity_id, slot);
        self.entity_ids.push(entity_id);
        self.data.extend_from_slice(data);
        true
    }

    /// Get component data for an entity – O(1)
    pub fn get(&self, entity_id: u32) -> Option<&[u8]> {
        let &slot = self.index_map.get(&entity_id)?;
        if self.element_size == 0 {
            let (start, len) = self.offsets[slot];
            Some(&self.data[start..start + len])
        } else {
            let start = slot * self.element_size;
            Some(&self.data[start..start + self.element_size])
        }
    }

    /// Get mutable component data for an entity – O(1)
    pub fn get_mut(&mut self, entity_id: u32) -> Option<&mut [u8]> {
        let &slot = self.index_map.get(&entity_id)?;
        if self.element_size == 0 {
            let (start, len) = self.offsets[slot];
            Some(&mut self.data[start..start + len])
        } else {
            let start = slot * self.element_size;
            Some(&mut self.data[start..start + self.element_size])
        }
    }

    /// Remove component from entity – O(1) via swap-remove
    pub fn remove(&mut self, entity_id: u32) -> bool {
        let idx = match self.index_map.remove(&entity_id) {
            Some(i) => i,
            None => return false,
        };

        let last_slot = self.entity_ids.len() - 1;

        if self.element_size == 0 {
            // Variable-size: rebuild without this slot
            let (rm_start, rm_len) = self.offsets[idx];
            let rm_end = rm_start + rm_len;
            let mut new_data = self.data[..rm_start].to_vec();
            new_data.extend_from_slice(&self.data[rm_end..]);
            self.data = new_data;

            self.entity_ids.remove(idx);
            self.offsets.remove(idx);

            // Shift all offsets after idx
            for i in idx..self.offsets.len() {
                self.offsets[i].0 -= rm_len;
            }

            // Rebuild index_map
            self.index_map.clear();
            for (i, &eid) in self.entity_ids.iter().enumerate() {
                self.index_map.insert(eid, i);
            }
        } else {
            if idx == last_slot {
                self.entity_ids.pop();
                let start = idx * self.element_size;
                self.data.truncate(start);
            } else {
                let last_entity = self.entity_ids[last_slot];
                self.entity_ids.swap_remove(idx);

                let src = last_slot * self.element_size;
                let dst = idx * self.element_size;
                for i in 0..self.element_size {
                    self.data.swap(dst + i, src + i);
                }
                self.data.truncate(last_slot * self.element_size);
                self.index_map.insert(last_entity, idx);
            }
        }

        true
    }

    /// Check if entity has this component – O(1)
    pub fn has(&self, entity_id: u32) -> bool {
        self.index_map.contains_key(&entity_id)
    }

    /// Get iterator over entity IDs with this component
    pub fn entity_ids(&self) -> impl Iterator<Item = u32> + '_ {
        self.entity_ids.iter().copied()
    }

    /// Get count of entities with this component
    pub fn count(&self) -> u32 {
        self.entity_ids.len() as u32
    }
}

/// Stores all components for all entities using Structure of Arrays
pub struct ComponentStorage {
    columns: HashMap<ComponentTypeId, ComponentColumn>,
    registry: ComponentRegistry,
}

impl ComponentStorage {
    /// Create a new component storage
    pub fn new() -> Self {
        ComponentStorage {
            columns: HashMap::new(),
            registry: ComponentRegistry::new(),
        }
    }

    /// Register a raw component type by numeric ID and element size.
    ///
    /// Used by the WASM/JS API where Rust's `TypeId` is unavailable.
    /// Idempotent: calling twice with the same `id` is a no-op.
    pub fn register_raw(&mut self, id: ComponentTypeId, element_size: usize) {
        self.columns
            .entry(id)
            .or_insert_with(|| ComponentColumn::new(id, element_size));
    }

    /// Register a new component type
    pub fn register_component_type<T: 'static>(&mut self) -> ComponentTypeId {
        self.registry.register::<T>()
    }

    /// **JS bridge upsert**: add or update a component using variable-size storage.
    ///
    /// Unlike `add_component()`, this never panics on size mismatch and
    /// overwrites existing data. Used by `bindings.rs` for all JS→WASM calls.
    pub fn upsert_js(&mut self, entity_id: u32, type_id: ComponentTypeId, data: &[u8]) {
        let column = self.columns
            .entry(type_id)
            .or_insert_with(|| ComponentColumn::new(type_id, 0));
        column.upsert_raw(entity_id, data);
    }

    /// Add a component to an entity.
    ///
    /// Works for both Rust-registered types (via `register_component_type`)
    /// and raw JS types (via `register_raw`).  For raw types the element
    /// size is inferred from `data.len()`.
    pub fn add_component(&mut self, entity_id: u32, type_id: ComponentTypeId, data: &[u8]) -> bool {
        // Try Rust registry first, fall back to data.len() for raw JS types
        let element_size = self.registry.size(type_id).unwrap_or(data.len());

        let column = self.columns
            .entry(type_id)
            .or_insert_with(|| ComponentColumn::new(type_id, element_size));

        column.add(entity_id, data)
    }

    /// Get component data from entity
    pub fn get_component(&self, entity_id: u32, type_id: ComponentTypeId) -> Option<&[u8]> {
        self.columns
            .get(&type_id)
            .and_then(|col| col.get(entity_id))
    }

    /// Get mutable component data from entity
    pub fn get_component_mut(&mut self, entity_id: u32, type_id: ComponentTypeId) -> Option<&mut [u8]> {
        self.columns
            .get_mut(&type_id)
            .and_then(|col| col.get_mut(entity_id))
    }

    /// Remove component from entity
    pub fn remove_component(&mut self, entity_id: u32, type_id: ComponentTypeId) -> bool {
        self.columns
            .get_mut(&type_id)
            .map(|col| col.remove(entity_id))
            .unwrap_or(false)
    }

    /// Check if entity has component
    pub fn has_component(&self, entity_id: u32, type_id: ComponentTypeId) -> bool {
        self.columns
            .get(&type_id)
            .map(|col| col.has(entity_id))
            .unwrap_or(false)
    }

    /// Get registry reference
    pub fn registry(&self) -> &ComponentRegistry {
        &self.registry
    }

    /// Get column for a component type
    pub fn column(&self, type_id: ComponentTypeId) -> Option<&ComponentColumn> {
        self.columns.get(&type_id)
    }
}

impl Default for ComponentStorage {
    fn default() -> Self {
        Self::new()
    }
}

/// Type-safe component handle
pub struct ComponentHandle<T> {
    type_id: ComponentTypeId,
    _marker: std::marker::PhantomData<T>,
}

impl<T: 'static> ComponentHandle<T> {
    /// Create a new component handle and register the type
    pub fn new(storage: &mut ComponentStorage) -> Self {
        let type_id = storage.register_component_type::<T>();
        ComponentHandle {
            type_id,
            _marker: std::marker::PhantomData,
        }
    }

    /// Get the component type ID
    pub fn type_id(&self) -> ComponentTypeId {
        self.type_id
    }

    /// Add component to entity
    pub fn add(&self, storage: &mut ComponentStorage, entity_id: u32, component: T) -> bool {
        let bytes = unsafe {
            std::slice::from_raw_parts(
                &component as *const _ as *const u8,
                std::mem::size_of::<T>(),
            )
        };
        storage.add_component(entity_id, self.type_id, bytes)
    }

    /// Get component from entity
    pub fn get<'a>(&self, storage: &'a ComponentStorage, entity_id: u32) -> Option<&'a T> {
        storage
            .get_component(entity_id, self.type_id)
            .map(|bytes| unsafe { &*(bytes.as_ptr() as *const T) })
    }

    /// Get mutable component from entity
    pub fn get_mut<'a>(&self, storage: &'a mut ComponentStorage, entity_id: u32) -> Option<&'a mut T> {
        storage
            .get_component_mut(entity_id, self.type_id)
            .map(|bytes| unsafe { &mut *(bytes.as_mut_ptr() as *mut T) })
    }

    /// Remove component from entity
    pub fn remove(&self, storage: &mut ComponentStorage, entity_id: u32) -> bool {
        storage.remove_component(entity_id, self.type_id)
    }

    /// Check if entity has component
    pub fn has(&self, storage: &ComponentStorage, entity_id: u32) -> bool {
        storage.has_component(entity_id, self.type_id)
    }
}

