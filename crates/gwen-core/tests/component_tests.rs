#[cfg(test)]
mod tests {
    use gwen_core::component::{ComponentStorage, ComponentHandle};

    #[derive(Clone, Copy, Debug, PartialEq)]
    struct Position {
        x: f32,
        y: f32,
    }

    #[derive(Clone, Copy, Debug, PartialEq)]
    struct Velocity {
        vx: f32,
        vy: f32,
    }

    #[derive(Clone, Copy, Debug, PartialEq)]
    struct Health {
        hp: i32,
    }

    #[test]
    fn test_register_component_type() {
        let mut storage = ComponentStorage::new();

        let pos_id = storage.register_component_type::<Position>();
        let vel_id = storage.register_component_type::<Velocity>();

        assert_ne!(pos_id, vel_id);
        assert_eq!(
            storage.registry().size(pos_id),
            Some(std::mem::size_of::<Position>())
        );
    }

    #[test]
    fn test_add_component() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        let pos = Position { x: 1.0, y: 2.0 };
        assert!(pos_handle.add(&mut storage, 0, pos));
        assert!(pos_handle.has(&storage, 0));
    }

    #[test]
    fn test_get_component() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        let original = Position { x: 1.0, y: 2.0 };
        pos_handle.add(&mut storage, 0, original);

        let retrieved = pos_handle.get(&storage, 0);
        assert_eq!(retrieved, Some(&original));
    }

    #[test]
    fn test_get_mutable_component() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        let original = Position { x: 1.0, y: 2.0 };
        pos_handle.add(&mut storage, 0, original);

        {
            let pos = pos_handle.get_mut(&mut storage, 0).unwrap();
            pos.x = 5.0;
        }

        let updated = pos_handle.get(&storage, 0).unwrap();
        assert_eq!(updated.x, 5.0);
    }

    #[test]
    fn test_remove_component() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        let pos = Position { x: 1.0, y: 2.0 };
        pos_handle.add(&mut storage, 0, pos);
        assert!(pos_handle.has(&storage, 0));

        assert!(pos_handle.remove(&mut storage, 0));
        assert!(!pos_handle.has(&storage, 0));
    }

    #[test]
    fn test_multiple_component_types() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);
        let vel_handle = ComponentHandle::<Velocity>::new(&mut storage);

        let pos = Position { x: 1.0, y: 2.0 };
        let vel = Velocity { vx: 3.0, vy: 4.0 };

        pos_handle.add(&mut storage, 0, pos);
        vel_handle.add(&mut storage, 0, vel);

        assert_eq!(pos_handle.get(&storage, 0), Some(&pos));
        assert_eq!(vel_handle.get(&storage, 0), Some(&vel));
    }

    #[test]
    fn test_multiple_entities_same_type() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        let pos0 = Position { x: 0.0, y: 0.0 };
        let pos1 = Position { x: 1.0, y: 1.0 };
        let pos2 = Position { x: 2.0, y: 2.0 };

        pos_handle.add(&mut storage, 0, pos0);
        pos_handle.add(&mut storage, 1, pos1);
        pos_handle.add(&mut storage, 2, pos2);

        assert_eq!(pos_handle.get(&storage, 0), Some(&pos0));
        assert_eq!(pos_handle.get(&storage, 1), Some(&pos1));
        assert_eq!(pos_handle.get(&storage, 2), Some(&pos2));
    }

    #[test]
    fn test_cannot_add_duplicate() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        let pos = Position { x: 1.0, y: 2.0 };
        assert!(pos_handle.add(&mut storage, 0, pos));
        assert!(!pos_handle.add(&mut storage, 0, pos)); // Should fail - already has
    }

    #[test]
    fn test_invalid_operations() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        // Get from non-existent entity
        assert_eq!(pos_handle.get(&storage, 999), None);

        // Remove from non-existent entity
        assert!(!pos_handle.remove(&mut storage, 999));

        // Check has
        assert!(!pos_handle.has(&storage, 999));
    }

    #[test]
    fn test_add_1k_components() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        let start = std::time::Instant::now();
        for i in 0..1000 {
            let pos = Position { x: i as f32, y: i as f32 };
            assert!(pos_handle.add(&mut storage, i, pos));
        }
        let elapsed = start.elapsed();

        assert!(elapsed.as_millis() < 50, "Adding 1K components took {}ms", elapsed.as_millis());
    }

    #[test]
    fn test_get_1k_components() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        for i in 0..1000 {
            let pos = Position { x: i as f32, y: i as f32 };
            pos_handle.add(&mut storage, i, pos);
        }

        let start = std::time::Instant::now();
        for i in 0..1000 {
            let _ = pos_handle.get(&storage, i);
        }
        let elapsed = start.elapsed();

        assert!(elapsed.as_millis() < 50, "Getting 1K components took {}ms", elapsed.as_millis());
    }

    #[test]
    fn test_remove_1k_components() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        for i in 0..1000 {
            let pos = Position { x: i as f32, y: i as f32 };
            pos_handle.add(&mut storage, i, pos);
        }

        let start = std::time::Instant::now();
        for i in 0..1000 {
            pos_handle.remove(&mut storage, i);
        }
        let elapsed = start.elapsed();

        assert!(elapsed.as_millis() < 50, "Removing 1K components took {}ms", elapsed.as_millis());
    }

    #[test]
    fn test_three_component_types() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);
        let vel_handle = ComponentHandle::<Velocity>::new(&mut storage);
        let health_handle = ComponentHandle::<Health>::new(&mut storage);

        // Entity 0: has Position, Velocity
        let pos0 = Position { x: 1.0, y: 2.0 };
        let vel0 = Velocity { vx: 3.0, vy: 4.0 };
        pos_handle.add(&mut storage, 0, pos0);
        vel_handle.add(&mut storage, 0, vel0);

        // Entity 1: has all three
        let pos1 = Position { x: 5.0, y: 6.0 };
        let vel1 = Velocity { vx: 7.0, vy: 8.0 };
        let health1 = Health { hp: 100 };
        pos_handle.add(&mut storage, 1, pos1);
        vel_handle.add(&mut storage, 1, vel1);
        health_handle.add(&mut storage, 1, health1);

        // Verify
        assert!(pos_handle.has(&storage, 0));
        assert!(vel_handle.has(&storage, 0));
        assert!(!health_handle.has(&storage, 0));

        assert!(pos_handle.has(&storage, 1));
        assert!(vel_handle.has(&storage, 1));
        assert!(health_handle.has(&storage, 1));
    }

    #[test]
    fn test_mixed_operations() {
        let mut storage = ComponentStorage::new();
        let pos_handle = ComponentHandle::<Position>::new(&mut storage);

        // Add 100
        for i in 0..100 {
            pos_handle.add(&mut storage, i, Position { x: i as f32, y: i as f32 });
        }

        // Remove 50
        for i in 0..50 {
            pos_handle.remove(&mut storage, i);
        }

        // Add 50 more
        for i in 100..150 {
            pos_handle.add(&mut storage, i, Position { x: i as f32, y: i as f32 });
        }

        // Verify remaining: 50-99, 100-149
        for i in 50..150 {
            assert!(pos_handle.has(&storage, i));
        }

        for i in 0..50 {
            assert!(!pos_handle.has(&storage, i));
        }
    }
}

