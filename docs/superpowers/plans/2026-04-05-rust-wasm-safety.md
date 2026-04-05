# Rust WASM Safety & Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éliminer tous les `panic!` atteignables depuis JS dans `gwen-core`, corriger l'injection de code JS dans `gwen-wasm-utils`, et fixer la corruption silencieuse de données dans `get_components_bulk`.

**Architecture:** Chaque `panic!` en contexte WASM crash la page JS de manière irrecupérable — il n'y a pas de stack unwinding dans `wasm32-unknown-unknown`. La stratégie est uniforme : convertir tous les chemins d'erreur en `Option`/`Result` et les propager jusqu'aux bindings WASM qui renvoient des sentinels JS (0, u32::MAX, ou false). La constante `TRANSFORM_SAB_TYPE_ID` dupliquée est consolidée dans `crate::transform` pour éviter tout drift silencieux.

**Tech Stack:** Rust, wasm-bindgen, web-sys, std::alloc, rapier

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `crates/gwen-core/src/ecs/entity.rs` | `allocate()` → `Option<EntityId>` |
| `crates/gwen-core/src/ecs/bitset.rs` | `assert!` → `debug_assert!` + retour bool |
| `crates/gwen-core/src/transform.rs` | Définir `TRANSFORM_SAB_TYPE_ID` (source unique) |
| `crates/gwen-core/src/ecs/storage.rs` | Importer depuis `crate::transform` |
| `crates/gwen-core/src/bindings.rs` | Patcher `alloc_shared_buffer`, `create_entity`, `get_components_bulk`, importer la constante |
| `crates/gwen-core/src/physics3d/world.rs` | Ajouter bounds guards dans `bulk_add_static_boxes` |
| `crates/gwen-wasm-utils/src/debug.rs` | Remplacer `js_sys::eval` par `web_sys::console` |
| `crates/gwen-core/tests/entity_tests.rs` | Tests pour `allocate()` à la limite |
| `crates/gwen-core/tests/bulk_ops_layout.rs` | Tests bounds guard |
| `crates/gwen-wasm-utils/src/lib.rs` | Ajouter `web-sys` feature si absent |

---

## Task 1 : Corriger `js_sys::eval` → `web_sys::console` (R-C5)

**Pourquoi en premier :** fix sécurité en 1 ligne, pas de refactoring en aval.

**Files:**
- Modify: `crates/gwen-wasm-utils/Cargo.toml`
- Modify: `crates/gwen-wasm-utils/src/debug.rs`

- [ ] **Étape 1 : Vérifier que `web-sys` avec la feature `console` est disponible**

```bash
grep -A5 'web-sys' crates/gwen-wasm-utils/Cargo.toml
```

Si `web-sys` est absent ou si la feature `"console"` manque, ajouter :

```toml
# crates/gwen-wasm-utils/Cargo.toml — dans [dependencies]
[dependencies]
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console"] }
wasm-bindgen = "0.2"
```

- [ ] **Étape 2 : Remplacer `js_sys::eval` par `web_sys::console::error_1`**

```rust
// crates/gwen-wasm-utils/src/debug.rs
// Remplacer tout le bloc #[cfg(debug_assertions)] par :

#[cfg(debug_assertions)]
{
    let msg = format!(
        "[GWEN] Sentinel overwrite in plugin '{}': expected 0x{:08X}, got 0x{:08X}",
        plugin_name, SENTINEL, value
    );
    web_sys::console::error_1(&wasm_bindgen::JsValue::from_str(&msg));
}
```

- [ ] **Étape 3 : Compiler pour vérifier**

```bash
cargo build -p gwen-wasm-utils --target wasm32-unknown-unknown 2>&1 | grep -E "^error"
```

Résultat attendu : aucune ligne `error`.

- [ ] **Étape 4 : Commit**

```bash
git add crates/gwen-wasm-utils/
git commit -m "fix(wasm-utils): replace js_sys::eval with web_sys::console to prevent JS injection

js_sys::eval interpolated plugin_name (user-controlled) directly into a JS
string — any single-quote in the name executed arbitrary JavaScript.
web_sys::console::error_1 passes the message as a JsValue, never evaluated.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2 : Consolider `TRANSFORM_SAB_TYPE_ID` (R-I2)

**Pourquoi :** prérequis pour Task 3 (bindings.rs). Établit la source unique de vérité avant de modifier les usages.

**Files:**
- Modify: `crates/gwen-core/src/transform.rs` (ou créer si inexistant)
- Modify: `crates/gwen-core/src/ecs/storage.rs`
- Modify: `crates/gwen-core/src/bindings.rs`

- [ ] **Étape 1 : Localiser où est défini `TRANSFORM_STRIDE` (source canonique)**

```bash
grep -n "TRANSFORM_STRIDE\|pub mod transform" crates/gwen-core/src/lib.rs crates/gwen-core/src/transform.rs 2>/dev/null | head -10
```

- [ ] **Étape 2 : Ajouter la constante publique dans `transform.rs`**

Ouvrir `crates/gwen-core/src/transform.rs` et ajouter après les autres constantes :

```rust
/// Sentinel component type ID used to identify the transform SAB column.
///
/// This value is chosen to be far outside the normal type-ID range so it
/// never collides with a user-registered component type.
/// Must stay in sync with the TypeScript side: `TRANSFORM_SAB_TYPE_ID` in
/// `packages/core/src/engine/wasm-bridge.ts`.
pub const TRANSFORM_SAB_TYPE_ID: u32 = u32::MAX - 1;
```

- [ ] **Étape 3 : Remplacer la définition locale dans `storage.rs`**

Dans `crates/gwen-core/src/ecs/storage.rs`, remplacer :

```rust
// AVANT
const TRANSFORM_SAB_TYPE_ID: u32 = u32::MAX - 1;
```

par :

```rust
// APRÈS
use crate::transform::TRANSFORM_SAB_TYPE_ID;
```

- [ ] **Étape 4 : Remplacer la définition locale dans `bindings.rs`**

Dans `crates/gwen-core/src/bindings.rs` ligne ~26, remplacer :

```rust
// AVANT
const TRANSFORM_SAB_TYPE_ID: u32 = u32::MAX - 1;
```

par :

```rust
// APRÈS  — importer depuis transform pour avoir une source unique
use crate::transform::TRANSFORM_SAB_TYPE_ID;
```

- [ ] **Étape 5 : Compiler**

```bash
cargo build -p gwen-core --target wasm32-unknown-unknown 2>&1 | grep -E "^error"
```

Résultat attendu : aucune ligne `error`.

- [ ] **Étape 6 : Commit**

```bash
git add crates/gwen-core/src/transform.rs crates/gwen-core/src/ecs/storage.rs crates/gwen-core/src/bindings.rs
git commit -m "refactor(gwen-core): deduplicate TRANSFORM_SAB_TYPE_ID into transform module

Two independent definitions of u32::MAX-1 existed in bindings.rs and
storage.rs — a silent drift risk on the core transform sync pipeline.
Now defined once in crate::transform and imported everywhere.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3 : Convertir `EntityAllocator::allocate` en `Option<EntityId>` (R-C2)

**Pourquoi :** le `panic!` sur dépassement de `max_entities` crash la page JS dans un scénario courant (vague d'ennemis).

**Files:**
- Modify: `crates/gwen-core/src/ecs/entity.rs`
- Modify: `crates/gwen-core/src/bindings.rs` (appelants de `allocate`)
- Modify: `crates/gwen-core/tests/entity_tests.rs`

- [ ] **Étape 1 : Écrire le test qui documente le comportement attendu**

Dans `crates/gwen-core/tests/entity_tests.rs`, ajouter :

```rust
#[test]
fn allocate_returns_none_at_capacity() {
    let mut alloc = EntityAllocator::new(3);
    assert!(alloc.allocate().is_some(), "slot 0 should succeed");
    assert!(alloc.allocate().is_some(), "slot 1 should succeed");
    assert!(alloc.allocate().is_some(), "slot 2 should succeed");
    assert!(
        alloc.allocate().is_none(),
        "slot 3 should return None, not panic"
    );
}

#[test]
fn allocate_reuses_freed_slots_after_capacity() {
    let mut alloc = EntityAllocator::new(2);
    let e0 = alloc.allocate().unwrap();
    let _e1 = alloc.allocate().unwrap();
    assert!(alloc.allocate().is_none(), "full capacity");

    // Libérer e0 et réallouer — doit réussir même si plein
    alloc.deallocate(e0);
    let e2 = alloc.allocate();
    assert!(e2.is_some(), "freed slot should be reusable");
}
```

- [ ] **Étape 2 : Vérifier que le test échoue (panic actuel intercepté comme échec)**

```bash
cargo test -p gwen-core allocate_returns_none_at_capacity 2>&1 | tail -5
```

Résultat attendu : `FAILED` (panic ou unexpected success).

- [ ] **Étape 3 : Modifier `allocate` pour retourner `Option<EntityId>`**

Dans `crates/gwen-core/src/ecs/entity.rs` :

```rust
// AVANT
pub fn allocate(&mut self) -> EntityId {
    // ... (code existant) ...
    } else {
        panic!("Entity limit reached: {}", self.max_entities);
    }
}

// APRÈS
pub fn allocate(&mut self) -> Option<EntityId> {
    if let Some(index) = self.free_list.pop() {
        let record = &mut self.records[index as usize];
        record.generation = record.generation.wrapping_add(1);
        record.alive = true;
        self.num_live += 1;
        Some(EntityId {
            index,
            generation: record.generation,
        })
    } else if (self.records.len() as u32) < self.max_entities {
        let index = self.records.len() as u32;
        self.records.push(EntityRecord {
            generation: 0,
            alive: true,
        });
        self.num_live += 1;
        Some(EntityId {
            index,
            generation: 0,
        })
    } else {
        None
    }
}
```

- [ ] **Étape 4 : Mettre à jour tous les appelants dans `bindings.rs`**

Chercher tous les appels à `allocate()` :

```bash
grep -n "\.allocate()" crates/gwen-core/src/bindings.rs
```

Pour chaque appel (typiquement dans `create_entity` et `create_entities_bulk`), remplacer le pattern :

```rust
// AVANT — dans create_entity
let entity = self.entity_manager.allocator.allocate();
// ...utilisation directe de entity...

// APRÈS
let Some(entity) = self.entity_manager.allocator.allocate() else {
    // Retourner une paire (index=u32::MAX, generation=u32::MAX) comme sentinel
    // Le TypeScript vérifie entity_index != u32::MAX avant d'utiliser l'entité.
    return u64::MAX;   // ou 0 selon la signature de retour
};
```

> **Note :** la valeur sentinel exacte dépend de la signature de retour de chaque binding. Vérifier le type de retour avec `grep -n "fn create_entity" crates/gwen-core/src/bindings.rs`.

- [ ] **Étape 5 : Mettre à jour `EntityManager::create` si elle encapsule `allocate`**

```bash
grep -n "fn create\b" crates/gwen-core/src/ecs/entity.rs
```

Si `EntityManager::create` appelle `allocate()` directement, appliquer le même pattern `Option`.

- [ ] **Étape 6 : Compiler**

```bash
cargo build -p gwen-core --target wasm32-unknown-unknown 2>&1 | grep -E "^error"
```

- [ ] **Étape 7 : Lancer les tests**

```bash
cargo test -p gwen-core allocate 2>&1 | tail -10
```

Résultat attendu : `test allocate_returns_none_at_capacity ... ok` et `test allocate_reuses_freed_slots_after_capacity ... ok`.

- [ ] **Étape 8 : Commit**

```bash
git add crates/gwen-core/src/ecs/entity.rs crates/gwen-core/src/bindings.rs crates/gwen-core/tests/entity_tests.rs
git commit -m "fix(gwen-core): convert EntityAllocator::allocate to Option<EntityId>

panic! at entity limit crashed the JS page unconditionally — a common
in-game scenario (enemy waves, particle systems). Now returns None and
the WASM binding propagates a u64::MAX sentinel that TypeScript can check.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4 : Corriger `alloc_shared_buffer` pour retourner 0 sur erreur (R-C1)

**Files:**
- Modify: `crates/gwen-core/src/bindings.rs`
- Modify: `packages/core/src/engine/wasm-bridge.ts` (vérification côté TS)

- [ ] **Étape 1 : Vérifier la signature TS actuelle de `alloc_shared_buffer`**

```bash
grep -n "alloc_shared_buffer" packages/core/src/engine/wasm-bridge.ts | head -10
```

- [ ] **Étape 2 : Modifier `alloc_shared_buffer` pour retourner 0 en cas d'erreur**

Dans `crates/gwen-core/src/bindings.rs` :

```rust
// AVANT
pub fn alloc_shared_buffer(&mut self, byte_length: usize) -> usize {
    let layout = std::alloc::Layout::from_size_align(byte_length, 8)
        .expect("alloc_shared_buffer: invalid layout");
    let ptr = unsafe { std::alloc::alloc_zeroed(layout) };
    if ptr.is_null() {
        panic!("alloc_shared_buffer: allocation failed (OOM)");
    }
    ptr as usize
}

// APRÈS
/// Allocates a zeroed buffer of `byte_length` bytes with 8-byte alignment.
///
/// # Returns
/// The pointer as `usize`, or **0** on failure (zero-size request or OOM).
/// The TypeScript caller must check for 0 before using the pointer.
pub fn alloc_shared_buffer(&mut self, byte_length: usize) -> usize {
    if byte_length == 0 {
        return 0;
    }
    let Ok(layout) = std::alloc::Layout::from_size_align(byte_length, 8) else {
        return 0;
    };
    // SAFETY: layout has non-zero size and valid alignment.
    let ptr = unsafe { std::alloc::alloc_zeroed(layout) };
    if ptr.is_null() {
        return 0; // OOM — caller must handle gracefully
    }
    ptr as usize
}
```

- [ ] **Étape 3 : Ajouter la vérification côté TypeScript**

Dans `packages/core/src/engine/wasm-bridge.ts`, trouver l'appel à `alloc_shared_buffer` :

```bash
grep -n "alloc_shared_buffer" packages/core/src/engine/wasm-bridge.ts
```

Entourer l'appel d'une guard :

```typescript
const ptr = this._engine.alloc_shared_buffer(byteLength);
if (ptr === 0) {
  throw new Error(
    `[GwenBridge] alloc_shared_buffer failed: requested ${byteLength} bytes. ` +
    `This is either an OOM condition or a zero-size request.`
  );
}
```

- [ ] **Étape 4 : Compiler et tester**

```bash
cargo build -p gwen-core --target wasm32-unknown-unknown 2>&1 | grep -E "^error"
pnpm --filter @gwenjs/core test 2>&1 | tail -15
```

Résultat attendu : build propre, tests verts.

- [ ] **Étape 5 : Commit**

```bash
git add crates/gwen-core/src/bindings.rs packages/core/src/engine/wasm-bridge.ts
git commit -m "fix(gwen-core): alloc_shared_buffer returns 0 instead of panic on OOM/zero-size

panic! in a wasm32 context is an unrecoverable JS RuntimeError.
Now returns 0 (null pointer sentinel) so the TypeScript bridge can throw
a structured Error with actionable context instead of crashing the page.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5 : Bounds guards dans `bulk_add_static_boxes` (R-C3)

**Files:**
- Modify: `crates/gwen-core/src/physics3d/world.rs`
- Modify: `crates/gwen-core/tests/bulk_ops_layout.rs`

- [ ] **Étape 1 : Localiser la fonction exacte**

```bash
grep -n "fn bulk_add_static_boxes\|positions_flat\|half_extents_flat" crates/gwen-core/src/physics3d/world.rs | head -15
```

- [ ] **Étape 2 : Écrire le test de régression**

Dans `crates/gwen-core/tests/bulk_ops_layout.rs`, ajouter :

```rust
#[test]
fn bulk_add_static_boxes_wrong_positions_buffer_returns_zero() {
    let mut world = PhysicsWorld3D::new(PhysicsConfig3D::default());
    // n=3 boxes mais positions buffer trop court (6 floats au lieu de 9)
    let positions: Vec<f32> = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
    let half_extents: Vec<f32> = vec![0.5, 0.5, 0.5]; // uniform
    let result = world.bulk_add_static_boxes(&positions, &half_extents, 3);
    assert_eq!(result, 0, "should return 0 bodies added, not panic");
}

#[test]
fn bulk_add_static_boxes_correct_buffer_succeeds() {
    let mut world = PhysicsWorld3D::new(PhysicsConfig3D::default());
    let positions: Vec<f32> = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 2.0, 0.0, 0.0];
    let half_extents: Vec<f32> = vec![0.5, 0.5, 0.5]; // uniform
    let result = world.bulk_add_static_boxes(&positions, &half_extents, 3);
    assert_eq!(result, 3, "should add 3 bodies");
}
```

- [ ] **Étape 3 : Vérifier que le premier test panic actuellement**

```bash
cargo test -p gwen-core bulk_add_static_boxes_wrong_positions 2>&1 | tail -5
```

Résultat attendu : `FAILED` (panic ou out-of-bounds).

- [ ] **Étape 4 : Ajouter les guards au début de `bulk_add_static_boxes`**

Dans `crates/gwen-core/src/physics3d/world.rs`, au début de la fonction :

```rust
pub fn bulk_add_static_boxes(
    &mut self,
    positions_flat: &[f32],
    half_extents_flat: &[f32],
    n: usize,
) -> usize {
    // --- GUARDS ---
    if n == 0 {
        return 0;
    }
    if positions_flat.len() < n * 3 {
        // Buffer trop court — refuser silencieusement plutôt que de paniquer
        return 0;
    }
    // Déterminer si half_extents est uniforme (3 floats) ou par-entité (n*3 floats)
    let uniform_extents = half_extents_flat.len() == 3;
    if !uniform_extents && half_extents_flat.len() < n * 3 {
        return 0;
    }
    // --- FIN GUARDS ---

    // ... reste du code existant inchangé ...
}
```

- [ ] **Étape 5 : Lancer les tests**

```bash
cargo test -p gwen-core bulk_add_static_boxes 2>&1 | tail -10
```

Résultat attendu : les deux tests `ok`.

- [ ] **Étape 6 : Commit**

```bash
git add crates/gwen-core/src/physics3d/world.rs crates/gwen-core/tests/bulk_ops_layout.rs
git commit -m "fix(gwen-core): add bounds guards to bulk_add_static_boxes

Without bounds checks, passing a positions buffer shorter than n*3 floats
caused an index-out-of-bounds panic in WASM — crashing the JS page.
Now returns 0 (bodies added) on malformed input instead of panicking.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6 : Corriger `BitSet128::set` — `assert!` → retour de `bool` (R-C4)

**Files:**
- Modify: `crates/gwen-core/src/ecs/bitset.rs`
- Modify: `crates/gwen-core/src/ecs/component.rs` (appelant de `assign_bit_index`)

- [ ] **Étape 1 : Lire la signature complète de `BitSet128::set` et `contains`**

```bash
cat crates/gwen-core/src/ecs/bitset.rs
```

- [ ] **Étape 2 : Changer `set` pour retourner `bool` (succès/échec)**

```rust
// AVANT
pub fn set(&mut self, index: u8) {
    assert!(index < 128, "BitSet128 index out of bounds: {}", index);
    // ...
}

// APRÈS
/// Sets the bit at `index`. Returns `false` if `index >= 128` (no-op).
pub fn set(&mut self, index: u8) -> bool {
    if index >= 128 {
        debug_assert!(false, "BitSet128 index out of bounds: {}", index);
        return false;
    }
    let (word, bit) = (index / 64, index % 64);
    self.bits[word as usize] |= 1u64 << bit;
    true
}
```

- [ ] **Étape 3 : Changer `contains` de même**

```rust
// AVANT
pub fn contains(&self, index: u8) -> bool {
    assert!(index < 128, "BitSet128 index out of bounds: {}", index);
    // ...
}

// APRÈS
pub fn contains(&self, index: u8) -> bool {
    if index >= 128 {
        debug_assert!(false, "BitSet128 index out of bounds: {}", index);
        return false;
    }
    let (word, bit) = (index / 64, index % 64);
    (self.bits[word as usize] >> bit) & 1 == 1
}
```

- [ ] **Étape 4 : Propager le `bool` dans `component.rs`**

```bash
grep -n "assign_bit_index\|\.set(" crates/gwen-core/src/ecs/component.rs | head -10
```

Dans `component.rs`, où `bitset.set(index)` est appelé pour enregistrer un composant :

```rust
// AVANT
assert!(self.next_bit_index < 128, "Maximum of 128 component types exceeded");
self.bitset.set(self.next_bit_index);

// APRÈS
if self.next_bit_index >= 128 {
    // Retourner une erreur que le binding WASM peut propager
    return Err("Maximum of 128 component types exceeded. Consider splitting component sets across scenes.");
}
self.bitset.set(self.next_bit_index);
```

Adapter le type de retour de la fonction encapsulante en `Result<..., &'static str>` et faire remonter jusqu'au binding `register_component_type` dans `bindings.rs` qui retourne un `bool` ou `u32` sentinel vers JS.

- [ ] **Étape 5 : Compiler et lancer les tests existants**

```bash
cargo test -p gwen-core 2>&1 | tail -20
```

Résultat attendu : tous les tests `ok`, pas de nouveaux `FAILED`.

- [ ] **Étape 6 : Commit**

```bash
git add crates/gwen-core/src/ecs/bitset.rs crates/gwen-core/src/ecs/component.rs crates/gwen-core/src/bindings.rs
git commit -m "fix(gwen-core): replace release-mode assert! in BitSet128 with graceful bool return

assert! fires in release WASM builds — a game with >128 component types
would panic at arbitrary runtime moments. Now returns false (no-op) with
debug_assert! for development. The component registry returns an error
that propagates to the JS binding instead of crashing.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7 : Corriger `get_components_bulk` — inférence de taille incorrecte (R-I1)

**Files:**
- Modify: `crates/gwen-core/src/bindings.rs`
- Modify: `crates/gwen-core/tests/bulk_ops_layout.rs`

- [ ] **Étape 1 : Écrire le test de régression**

Dans `crates/gwen-core/tests/bulk_ops_layout.rs`, ajouter :

```rust
#[test]
fn get_components_bulk_dead_entity_before_live_preserves_offsets() {
    // Scenario : entity 0 morte, entity 1 vivante avec composant de 4 bytes.
    // Le slot de entity 0 doit être zéro (pré-zéré par JS).
    // Le slot de entity 1 doit contenir les 4 bytes du composant.
    // Le slot de entity 2 doit être zéro (morte).
    // Sans le fix, l'inférence de taille est incorrecte et entity 1 écrase entity 0's slot.

    let mut engine = Engine::new(EngineConfig { max_entities: 10, ..Default::default() });
    let comp_id = engine.register_component_type(4); // composant de 4 bytes

    let _e0 = engine.create_entity(); // on va le détruire
    let e1 = engine.create_entity();
    engine.destroy_entity(/* e0 index */ 0, /* e0 gen */ 0);

    // Écrire des données dans e1
    engine.set_component(e1.index(), e1.generation(), comp_id, &[0xAB, 0xCD, 0xEF, 0x12]);

    let slots  = [0u32, e1.index()];
    let gens   = [0u32, e1.generation()]; // gen 0 est stale pour slot 0
    let mut out = vec![0u8; 8]; // 2 slots × 4 bytes
    let written = engine.get_components_bulk(&slots, &gens, comp_id, &mut out);

    assert_eq!(written, 8);
    // Slot 0 (morte) : doit rester zéro
    assert_eq!(&out[0..4], &[0, 0, 0, 0], "dead entity slot must be zero");
    // Slot 1 (vivante) : doit contenir les données
    assert_eq!(&out[4..8], &[0xAB, 0xCD, 0xEF, 0x12], "live entity slot must contain data");
}
```

- [ ] **Étape 2 : Vérifier que le test échoue**

```bash
cargo test -p gwen-core get_components_bulk_dead_entity 2>&1 | tail -10
```

Résultat attendu : `FAILED`.

- [ ] **Étape 3 : Implémenter le fix**

La solution correcte : exiger que le caller passe `comp_size` explicitement (toujours connu côté JS), **ou** dériver `comp_size` du premier succès et utiliser `live_count` séparé pour l'inférence. La deuxième option ne change pas la signature WASM :

```rust
// Dans bindings.rs, fonction get_components_bulk :
// Remplacer le bloc else (entité morte) par :

} else {
    // Entité morte ou composant absent — avancer le curseur d'un comp_size.
    // comp_size est connu dès le premier slot live ; si aucun slot live encore,
    // on ne peut pas avancer (le JS a pré-zéré le buffer, on laisse à 0).
    if let Some(size) = first_comp_size {
        bytes_written += size;
        if bytes_written > out_buf.len() {
            bytes_written = out_buf.len();
            break;
        }
    }
    // Si first_comp_size est None : aucune entité vivante encore vue,
    // on ne peut pas avancer → le slot restera à 0 (pré-zéré).
}
```

Et dans le bloc succès, stocker la taille :

```rust
// Ajouter avant la boucle
let mut first_comp_size: Option<usize> = None;

// Dans le bloc if let Some(src) = component_bytes :
let comp_size = src.len();
if first_comp_size.is_none() {
    first_comp_size = Some(comp_size);
}
// ... reste inchangé ...
```

- [ ] **Étape 4 : Lancer les tests**

```bash
cargo test -p gwen-core get_components_bulk 2>&1 | tail -10
```

Résultat attendu : `ok`.

- [ ] **Étape 5 : Commit**

```bash
git add crates/gwen-core/src/bindings.rs crates/gwen-core/tests/bulk_ops_layout.rs
git commit -m "fix(gwen-core): correct get_components_bulk size inference for dead-before-live entities

When dead entities appeared before live ones in the slots array, the cursor
advanced by bytes_written/i — a fractional value that corrupted all subsequent
slot offsets. Now tracks first_comp_size separately and uses it consistently.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8 : Guard de taille dans `sync_transforms_to/from_buffer` (R-I9)

**Files:**
- Modify: `crates/gwen-core/src/bindings.rs`

- [ ] **Étape 1 : Localiser les deux fonctions de sync**

```bash
grep -n "fn sync_transforms_to_buffer\|fn sync_transforms_from_buffer" crates/gwen-core/src/bindings.rs
```

- [ ] **Étape 2 : Stocker les métadonnées du buffer alloué dans `Engine`**

Dans la struct `Engine` (en haut de `bindings.rs`), ajouter un champ :

```rust
// Dans la struct Engine { ... }
/// Tracks (ptr, byte_length) for the shared transform buffer allocated by
/// alloc_shared_buffer, so sync functions can validate max_entities.
shared_buffer_meta: Option<(usize, usize)>,
```

Dans `alloc_shared_buffer`, après l'allocation réussie :

```rust
self.shared_buffer_meta = Some((ptr as usize, byte_length));
```

- [ ] **Étape 3 : Ajouter la validation dans `sync_transforms_to_buffer`**

```rust
pub fn sync_transforms_to_buffer(&mut self, ptr: usize, max_entities: u32) {
    const STRIDE: usize = 32; // 8 f32 × 4 bytes
    // Guard : vérifier que le buffer est assez grand
    if let Some((_alloc_ptr, alloc_size)) = self.shared_buffer_meta {
        let required = max_entities as usize * STRIDE;
        if required > alloc_size {
            // Tronquer silencieusement plutôt que d'écrire hors bounds
            let safe_max = (alloc_size / STRIDE) as u32;
            return self.sync_transforms_to_buffer(ptr, safe_max);
        }
    }
    // ... reste du code existant inchangé ...
}
```

Appliquer la même guard à `sync_transforms_from_buffer`.

- [ ] **Étape 4 : Compiler**

```bash
cargo build -p gwen-core --target wasm32-unknown-unknown 2>&1 | grep -E "^error"
```

- [ ] **Étape 5 : Commit**

```bash
git add crates/gwen-core/src/bindings.rs
git commit -m "fix(gwen-core): add allocation size guard to sync_transforms_to/from_buffer

Passing max_entities larger than the alloc_shared_buffer size caused silent
OOB writes into arbitrary WASM memory. Now validates against stored
(ptr, byte_length) metadata and truncates safely instead of overwriting.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9 : Tests de régression globaux

- [ ] **Étape 1 : Lancer tous les tests Rust**

```bash
cargo test -p gwen-core -p gwen-wasm-utils 2>&1 | tail -20
```

Résultat attendu : tous `ok`, aucun `FAILED`.

- [ ] **Étape 2 : Build WASM final**

```bash
pnpm build:wasm 2>&1 | tail -10
```

Résultat attendu : build complet sans erreur.

- [ ] **Étape 3 : Lancer les tests TS qui dépendent du WASM**

```bash
pnpm --filter @gwenjs/core test 2>&1 | tail -20
pnpm --filter @gwenjs/physics3d test 2>&1 | tail -20
```

Résultat attendu : tous verts.

- [ ] **Étape 4 : Commit de clôture si besoin**

```bash
git add -A
git commit -m "test(gwen-core): add integration regression tests for WASM safety fixes

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
