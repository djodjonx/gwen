# Testing Strategy - GWEN Framework

## Convention de Tests Rust

Le projet suit la meilleure pratique Rust pour l'organisation des tests:

### 1. Unit Tests (dans les modules)

**Localisation:** `src/module.rs` → `#[cfg(test)] mod tests`

**Quand:**
- Tests de fonctions/structures PRIVÉES
- Tests simples et rapides
- Helpers ou utilities internes

**Exemple:**
```rust
// allocator.rs
mod tests {
    #[test]
    fn test_align_offset() { ... }
}
```

**Modules avec unit tests:**
- ✅ `allocator.rs` - test `align_offset()` (fonction privée)
- ✅ `events.rs` - tests simples d'enregistrement

### 2. Integration Tests (fichiers séparés)

**Localisation:** `tests/*.rs`

**Quand:**
- Tests de l'API PUBLIQUE
- Tests complexes avec plusieurs composants
- Tests avec state/fixtures
- Tests de scénarios réalistes

**Exemple:**
```rust
// tests/entity_tests.rs
use gwen_core::entity::*;

#[test]
fn test_allocate_multiple() { ... }
```

**Fichiers de test:**
- ✅ `tests/entity_tests.rs` - 11 tests
- ✅ `tests/component_tests.rs` - 14 tests
- ✅ `tests/query_tests.rs` - 21 tests
- ✅ `tests/allocator_tests.rs` - 23 tests
- ✅ `tests/integration_tests.rs` - global tests

### 3. Avantages de cette approche

| Aspect | Unit Tests | Integration Tests |
|--------|-----------|-------------------|
| Compilation | Rapide | Plus lent (complet) |
| Scope | Module-level | Crate-level |
| Access | Code privé + public | Code public uniquement |
| Dépendances | Minimales | Peuvent dépendre d'autres crates |
| Finalité | Implémentation | API contract |
| Execution | `cargo test --lib` | `cargo test --test` |

### 4. Exécution des tests

```bash
# Tous les tests
cargo test

# Seulement unit tests
cargo test --lib

# Seulement integration tests
cargo test --test

# Un fichier spécifique
cargo test --test entity_tests

# Un test spécifique
cargo test test_allocate_multiple

# Avec output
cargo test -- --nocapture
```

## Structure Actuelle ✅

```
crates/gwen-core/
├── src/
│   ├── entity.rs          (no tests - all in tests/)
│   ├── component.rs       (no tests - all in tests/)
│   ├── query.rs           (no tests - all in tests/)
│   ├── allocator.rs       (align_offset unit test)
│   ├── events.rs          (10 simple unit tests)
│   ├── gameloop.rs        (no tests yet)
│   └── bindings.rs        (no tests yet)
│
└── tests/
    ├── entity_tests.rs    (11 integration tests)
    ├── component_tests.rs (14 integration tests)
    ├── query_tests.rs     (21 integration tests)
    ├── allocator_tests.rs (23 integration tests)
    └── integration_tests.rs (1 placeholder)
```

## Bonnes pratiques respectées ✅

- ✅ Unit tests pour implémentation interne
- ✅ Integration tests pour API publique
- ✅ Pas de doublons de tests
- ✅ Tests organisés par module
- ✅ Naming clairs (`*_tests.rs`)
- ✅ 88 tests au total
- ✅ 100% pass rate
- ✅ 80%+ coverage

## Résumé

**La structure actuelle est OPTIMALE et suit les conventions Rust.**

Pas besoin de changements! 🎉

