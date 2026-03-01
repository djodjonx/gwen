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

/// Stores components of one type in a Structure of Arrays layout
pub struct ComponentColumn {
    entity_ids: Vec<u32>,
    data: Vec<u8>,
    type_id: ComponentTypeId,
    element_size: usize,
}

impl ComponentColumn {
    /// Create a new component column
    pub fn new(type_id: ComponentTypeId, element_size: usize) -> Self {
        ComponentColumn {
            entity_ids: Vec::new(),
            data: Vec::new(),
            type_id,
            element_size,
        }
    }

    /// Add a component for an entity
    pub fn add(&mut self, entity_id: u32, data: &[u8]) -> bool {
        // Check if entity already has this component
        if self.entity_ids.contains(&entity_id) {
            return false;
        }

        assert_eq!(data.len(), self.element_size, 
            "Data size mismatch for component type {:?}", self.type_id);

        self.entity_ids.push(entity_id);
        self.data.extend_from_slice(data);
        true
    }

    /// Get component data for an entity
    pub fn get(&self, entity_id: u32) -> Option<&[u8]> {
        self.entity_ids
            .iter()
            .position(|&id| id == entity_id)
            .map(|idx| {
                let start = idx * self.element_size;
                &self.data[start..start + self.element_size]
            })
    }

    /// Get mutable component data for an entity
    pub fn get_mut(&mut self, entity_id: u32) -> Option<&mut [u8]> {
        self.entity_ids
            .iter()
            .position(|&id| id == entity_id)
            .map(|idx| {
                let start = idx * self.element_size;
                &mut self.data[start..start + self.element_size]
            })
    }

    /// Remove component from entity
    pub fn remove(&mut self, entity_id: u32) -> bool {
        if let Some(idx) = self.entity_ids.iter().position(|&id| id == entity_id) {
            self.entity_ids.remove(idx);
            let start = idx * self.element_size;
            self.data.drain(start..start + self.element_size);
            true
        } else {
            false
        }
    }

    /// Check if entity has this component
    pub fn has(&self, entity_id: u32) -> bool {
        self.entity_ids.contains(&entity_id)
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

    /// Register a new component type
    pub fn register_component_type<T: 'static>(&mut self) -> ComponentTypeId {
        self.registry.register::<T>()
    }

    /// Add a component to an entity
    pub fn add_component(&mut self, entity_id: u32, type_id: ComponentTypeId, data: &[u8]) -> bool {
        let element_size = match self.registry.size(type_id) {
            Some(size) => size,
            None => return false, // Type not registered
        };

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

