#[cfg(test)]
mod tests {
    use gwen_core::component::ComponentTypeId;
    use gwen_core::query::{ArchetypeId, QueryId, QuerySystem};

    fn cid(id: u32) -> ComponentTypeId {
        ComponentTypeId::from_raw(id)
    }

    #[test]
    fn test_archetype_creation() {
        let arch = ArchetypeId::new(vec![cid(2), cid(1), cid(0)]);
        // Should be sorted
        assert_eq!(arch.components(), &[cid(0), cid(1), cid(2)]);
    }

    #[test]
    fn test_archetype_equality() {
        let arch1 = ArchetypeId::new(vec![cid(0), cid(1)]);
        let arch2 = ArchetypeId::new(vec![cid(1), cid(0)]);
        assert_eq!(arch1, arch2); // Same components, different order
    }

    #[test]
    fn test_query_creation() {
        let query = QueryId::new(vec![cid(0), cid(1)]);
        assert_eq!(query.required(), &[cid(0), cid(1)]);
    }

    #[test]
    fn test_query_deduplication() {
        let query = QueryId::new(vec![cid(0), cid(0), cid(1)]);
        assert_eq!(query.required().len(), 2); // Duplicates removed
    }

    #[test]
    fn test_query_matches_exact() {
        let archetype = ArchetypeId::new(vec![cid(0), cid(1)]);
        let query = QueryId::new(vec![cid(0), cid(1)]);
        assert!(query.matches(&archetype));
    }

    #[test]
    fn test_query_matches_superset() {
        let archetype = ArchetypeId::new(vec![cid(0), cid(1), cid(2)]);
        let query = QueryId::new(vec![cid(0), cid(1)]);
        assert!(query.matches(&archetype)); // Archetype has all required
    }

    #[test]
    fn test_query_no_match_subset() {
        let archetype = ArchetypeId::new(vec![cid(0), cid(1)]);
        let query = QueryId::new(vec![cid(0), cid(1), cid(2)]);
        assert!(!query.matches(&archetype)); // Missing component 2
    }

    #[test]
    fn test_query_result_add_entity() {
        let query = QueryId::new(vec![cid(0)]);
        let mut result = gwen_core::query::QueryResult::new(query);

        result.add_entity(10);
        result.add_entity(20);

        assert_eq!(result.len(), 2);
        assert_eq!(result.entities(), &[10, 20]);
    }

    #[test]
    fn test_query_result_iter() {
        let query = QueryId::new(vec![cid(0)]);
        let mut result = gwen_core::query::QueryResult::new(query);

        result.add_entity(10);
        result.add_entity(20);
        result.add_entity(30);

        let ids: Vec<_> = result.iter().collect();
        assert_eq!(ids, vec![10, 20, 30]);
    }

    #[test]
    fn test_query_system_single_component() {
        let mut qs = QuerySystem::new();

        // Entity 0: [A]
        qs.update_entity_archetype(0, vec![cid(0)]);

        let query = QueryId::new(vec![cid(0)]);
        let result = qs.query(query);

        assert_eq!(result.len(), 1);
        assert_eq!(result.entities(), &[0]);
    }

    #[test]
    fn test_query_system_multiple_components() {
        let mut qs = QuerySystem::new();

        // Entity 0: [A, B]
        qs.update_entity_archetype(0, vec![cid(0), cid(1)]);

        // Entity 1: [A]
        qs.update_entity_archetype(1, vec![cid(0)]);

        // Query for [A, B]
        let query = QueryId::new(vec![cid(0), cid(1)]);
        let result = qs.query(query);

        assert_eq!(result.len(), 1);
        assert_eq!(result.entities(), &[0]);
    }

    #[test]
    fn test_query_system_multiple_matches() {
        let mut qs = QuerySystem::new();

        // Entity 0: [A, B]
        qs.update_entity_archetype(0, vec![cid(0), cid(1)]);

        // Entity 1: [A, B, C]
        qs.update_entity_archetype(1, vec![cid(0), cid(1), cid(2)]);

        // Entity 2: [A]
        qs.update_entity_archetype(2, vec![cid(0)]);

        // Query for [A, B]
        let query = QueryId::new(vec![cid(0), cid(1)]);
        let result = qs.query(query);

        assert_eq!(result.len(), 2);
        assert!(result.entities().contains(&0));
        assert!(result.entities().contains(&1));
    }

    #[test]
    fn test_query_system_no_matches() {
        let mut qs = QuerySystem::new();

        // Entity 0: [A]
        qs.update_entity_archetype(0, vec![cid(0)]);

        // Query for [B]
        let query = QueryId::new(vec![cid(1)]);
        let result = qs.query(query);

        assert_eq!(result.len(), 0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_query_system_caching() {
        let mut qs = QuerySystem::new();

        qs.update_entity_archetype(0, vec![cid(0)]);

        let query = QueryId::new(vec![cid(0)]);

        // First query - computes
        let result1 = qs.query(query.clone());

        // Second query - should be cached (same QueryId)
        let result2 = qs.query(query);

        assert_eq!(result1.entities(), result2.entities());
    }

    #[test]
    fn test_query_system_cache_invalidation() {
        let mut qs = QuerySystem::new();

        // Entity 0: [A]
        qs.update_entity_archetype(0, vec![cid(0)]);

        let query = QueryId::new(vec![cid(0)]);
        let result1 = qs.query(query.clone());
        assert_eq!(result1.len(), 1);

        // Add entity 1: [A]
        qs.update_entity_archetype(1, vec![cid(0)]);

        // Query again - cache should be cleared
        let result2 = qs.query(query);
        assert_eq!(result2.len(), 2); // Now 2 entities match
    }

    #[test]
    fn test_query_system_remove_entity() {
        let mut qs = QuerySystem::new();

        qs.update_entity_archetype(0, vec![cid(0)]);
        qs.update_entity_archetype(1, vec![cid(0)]);

        let query = QueryId::new(vec![cid(0)]);
        let result1 = qs.query(query.clone());
        assert_eq!(result1.len(), 2);

        // Remove entity 0
        qs.remove_entity(0);

        let result2 = qs.query(query);
        assert_eq!(result2.len(), 1);
        assert_eq!(result2.entities(), &[1]);
    }

    #[test]
    fn test_query_system_empty_query() {
        let mut qs = QuerySystem::new();

        qs.update_entity_archetype(0, vec![cid(0)]);
        qs.update_entity_archetype(1, vec![cid(1)]);

        // Empty query should match all entities (no requirements)
        let query = QueryId::new(vec![]);
        let result = qs.query(query);

        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_query_system_complex_scenario() {
        let mut qs = QuerySystem::new();

        // Game entities example:
        // Player: [Position, Velocity, Health, Input]
        // Enemy: [Position, Velocity, Health, AI]
        // Projectile: [Position, Velocity]
        // Item: [Position]

        qs.update_entity_archetype(0, vec![cid(0), cid(1), cid(2), cid(3)]); // Player
        qs.update_entity_archetype(1, vec![cid(0), cid(1), cid(2), cid(4)]); // Enemy
        qs.update_entity_archetype(2, vec![cid(0), cid(1)]); // Projectile
        qs.update_entity_archetype(3, vec![cid(0)]); // Item

        // Query: entities with Position + Velocity (excludes items)
        let query = QueryId::new(vec![cid(0), cid(1)]);
        let result = qs.query(query);

        assert_eq!(result.len(), 3);
        assert!(result.entities().contains(&0)); // Player
        assert!(result.entities().contains(&1)); // Enemy
        assert!(result.entities().contains(&2)); // Projectile
    }

    #[test]
    fn test_query_performance_1k_entities() {
        let mut qs = QuerySystem::new();

        // Add 1000 entities with [A, B]
        for i in 0..1000 {
            qs.update_entity_archetype(i, vec![cid(0), cid(1)]);
        }

        let query = QueryId::new(vec![cid(0), cid(1)]);

        let start = std::time::Instant::now();
        let result = qs.query(query);
        let elapsed = start.elapsed();

        assert_eq!(result.len(), 1000);
        assert!(
            elapsed.as_millis() < 100,
            "Query took {}ms",
            elapsed.as_millis()
        );
    }

    #[test]
    fn test_query_performance_selective() {
        let mut qs = QuerySystem::new();

        // Add 1000 entities: 500 with [A], 500 with [A, B]
        for i in 0..500 {
            qs.update_entity_archetype(i, vec![cid(0)]);
        }
        for i in 500..1000 {
            qs.update_entity_archetype(i, vec![cid(0), cid(1)]);
        }

        // Query for [A, B]
        let query = QueryId::new(vec![cid(0), cid(1)]);

        let start = std::time::Instant::now();
        let result = qs.query(query);
        let elapsed = start.elapsed();

        assert_eq!(result.len(), 500);
        assert!(
            elapsed.as_millis() < 100,
            "Query took {}ms",
            elapsed.as_millis()
        );
    }

    #[test]
    fn test_query_multiple_queries() {
        let mut qs = QuerySystem::new();

        qs.update_entity_archetype(0, vec![cid(0), cid(1)]);
        qs.update_entity_archetype(1, vec![cid(0), cid(1), cid(2)]);
        qs.update_entity_archetype(2, vec![cid(0)]);

        // Query 1: [A, B]
        let query1 = QueryId::new(vec![cid(0), cid(1)]);
        let result1 = qs.query(query1);
        assert_eq!(result1.len(), 2); // Entities 0, 1

        // Query 2: [A]
        let query2 = QueryId::new(vec![cid(0)]);
        let result2 = qs.query(query2);
        assert_eq!(result2.len(), 3); // All entities

        // Query 3: [C]
        let query3 = QueryId::new(vec![cid(2)]);
        let result3 = qs.query(query3);
        assert_eq!(result3.len(), 1); // Entity 1
    }
}
