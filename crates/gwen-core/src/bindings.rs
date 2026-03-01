//! wasm-bindgen exports
//!
//! Exports for JavaScript interop via wasm-bindgen.

use wasm_bindgen::prelude::*;

/// Main engine exported to JavaScript
#[wasm_bindgen]
pub struct Engine {
    // To be implemented
}

#[wasm_bindgen]
impl Engine {
    /// Create a new engine instance
    #[wasm_bindgen(constructor)]
    pub fn new(_max_entities: u32) -> Engine {
        Engine {}
    }
}

