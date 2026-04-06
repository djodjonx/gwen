---
name: static_mut_refs_pattern
description: How to access static mut Option<T> in gwen-core WASM code without triggering the static_mut_refs lint (Rust 1.90+)
type: feedback
---

Use `std::ptr::addr_of!(STATIC_MUT)` plus a raw-pointer dereference instead of calling `.as_ref()` directly on a `static mut` variable. This avoids the `static_mut_refs` lint introduced in Rust 2024.

**Pattern:**
```rust
let value = unsafe {
    let ptr = std::ptr::addr_of!(MY_STATIC_MUT);
    match (*ptr).as_ref() {
        Some(v) => v,
        None => return default,
    }
};
```

For `addr_of!` used only to obtain a pointer (no dereference), the `unsafe` block is unnecessary — remove it to avoid the "unnecessary unsafe block" warning.

**Why:** Rust 1.87+ warns on any `&static_mut` reference creation inside unsafe blocks. Using `addr_of!` + raw dereference is the idiomatic fix for single-threaded WASM code.

**How to apply:** Every time a `static mut` variable needs a shared borrow (e.g., reading an `Option<T>` or slice), replace `unsafe { STATIC.as_ref() }` with the addr_of! pattern above.
