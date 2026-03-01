/* @ts-self-types="./gwen_core.d.ts" */

//#region exports

/**
 * Main engine exported to JavaScript
 */
export class Engine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_engine_free(ptr, 0);
    }
    /**
     * Add a raw-byte component to an entity.
     *
     * Uses **variable-size** mode: the column accepts any byte slice length
     * and performs an upsert (add-or-update). This is required because
     * TypeScript serialises components as JSON, so the byte length can
     * change between calls for the same component type.
     * @param {number} index
     * @param {number} generation
     * @param {number} component_type_id
     * @param {Uint8Array} data
     * @returns {boolean}
     */
    add_component(index, generation, component_type_id, data) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        _assertNum(generation);
        _assertNum(component_type_id);
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.engine_add_component(this.__wbg_ptr, index, generation, component_type_id, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Get count of live entities
     * @returns {number}
     */
    count_entities() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.engine_count_entities(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Create a new entity. Returns a `JsEntityId` with both `index` and
     * `generation` – keep the whole object, not just the index.
     * @returns {JsEntityId}
     */
    create_entity() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.engine_create_entity(this.__wbg_ptr);
        return JsEntityId.__wrap(ret);
    }
    /**
     * Delete an entity. Requires the full `{index, generation}` pair so
     * that stale handles are correctly rejected.
     * @param {number} index
     * @param {number} generation
     * @returns {boolean}
     */
    delete_entity(index, generation) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        _assertNum(generation);
        const ret = wasm.engine_delete_entity(this.__wbg_ptr, index, generation);
        return ret !== 0;
    }
    /**
     * Get delta time for current frame (in seconds)
     * @returns {number}
     */
    delta_time() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.engine_delta_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get current frame number
     * @returns {bigint}
     */
    frame_count() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.engine_frame_count(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Get raw component bytes for an entity (returns empty Vec if not found).
     * On the TypeScript side, use a DataView over the returned Uint8Array.
     * @param {number} index
     * @param {number} generation
     * @param {number} component_type_id
     * @returns {Uint8Array}
     */
    get_component_raw(index, generation, component_type_id) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        _assertNum(generation);
        _assertNum(component_type_id);
        const ret = wasm.engine_get_component_raw(this.__wbg_ptr, index, generation, component_type_id);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Get the current generation for a slot index.
     * Returns u32::MAX if the index is out of bounds.
     * Used by the TS bridge to reconstruct packed EntityIds from query results.
     * @param {number} index
     * @returns {number}
     */
    get_entity_generation(index) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        const ret = wasm.engine_get_entity_generation(this.__wbg_ptr, index);
        return ret >>> 0;
    }
    /**
     * Check if entity has component
     * @param {number} index
     * @param {number} generation
     * @param {number} component_type_id
     * @returns {boolean}
     */
    has_component(index, generation, component_type_id) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        _assertNum(generation);
        _assertNum(component_type_id);
        const ret = wasm.engine_has_component(this.__wbg_ptr, index, generation, component_type_id);
        return ret !== 0;
    }
    /**
     * Check if entity is alive. Requires `{index, generation}` – returns
     * `false` for any stale handle whose generation no longer matches.
     * @param {number} index
     * @param {number} generation
     * @returns {boolean}
     */
    is_alive(index, generation) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        _assertNum(generation);
        const ret = wasm.engine_is_alive(this.__wbg_ptr, index, generation);
        return ret !== 0;
    }
    /**
     * Create a new engine instance
     * @param {number} max_entities
     */
    constructor(max_entities) {
        _assertNum(max_entities);
        const ret = wasm.engine_new(max_entities);
        this.__wbg_ptr = ret >>> 0;
        EngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Query entities that have ALL the listed component types.
     * Returns a flat `Uint32Array` of entity indices.
     * @param {Uint32Array} component_type_ids
     * @returns {Uint32Array}
     */
    query_entities(component_type_ids) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passArray32ToWasm0(component_type_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.engine_query_entities(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * Register a new component type and return a unique numeric type ID.
     *
     * Each call returns a fresh, monotonically increasing ID.  Unlike the
     * native Rust API (which uses `std::any::TypeId`), this counter is
     * JS-friendly: callers just keep the returned number and pass it back.
     *
     * The actual column is created lazily on the first `add_component` call,
     * using the byte-slice length to determine the element size.
     * @returns {number}
     */
    register_component_type() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.engine_register_component_type(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Remove a component from an entity.
     * @param {number} index
     * @param {number} generation
     * @param {number} component_type_id
     * @returns {boolean}
     */
    remove_component(index, generation, component_type_id) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        _assertNum(generation);
        _assertNum(component_type_id);
        const ret = wasm.engine_remove_component(this.__wbg_ptr, index, generation, component_type_id);
        return ret !== 0;
    }
    /**
     * Reset frame timing
     */
    reset_frame() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.engine_reset_frame(this.__wbg_ptr);
    }
    /**
     * Check if should sleep for FPS capping
     * @returns {boolean}
     */
    should_sleep() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.engine_should_sleep(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Get sleep time in milliseconds
     * @returns {number}
     */
    sleep_time_ms() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.engine_sleep_time_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get engine statistics as JSON string
     * @returns {string}
     */
    stats() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.engine_stats(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Update game loop (call every frame with delta in milliseconds)
     * @param {number} delta_ms
     */
    tick(delta_ms) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.engine_tick(this.__wbg_ptr, delta_ms);
    }
    /**
     * Get total elapsed time (in seconds)
     * @returns {number}
     */
    total_time() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.engine_total_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * Update the archetype of an entity after component changes.
     * Pass the full list of component type IDs currently on the entity.
     * @param {number} index
     * @param {Uint32Array} component_type_ids
     */
    update_entity_archetype(index, component_type_ids) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        const ptr0 = passArray32ToWasm0(component_type_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.engine_update_entity_archetype(this.__wbg_ptr, index, ptr0, len0);
    }
}
if (Symbol.dispose) Engine.prototype[Symbol.dispose] = Engine.prototype.free;

/**
 * Entity handle returned to JavaScript.
 * Carries both `index` and `generation` so JS can pass them back and
 * the engine can detect stale (dangling) references.
 */
export class JsEntityId {
    constructor() {
        throw new Error('cannot invoke `new` directly');
    }
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(JsEntityId.prototype);
        obj.__wbg_ptr = ptr;
        JsEntityIdFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JsEntityIdFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jsentityid_free(ptr, 0);
    }
    /**
     * Generation counter – incremented every time the slot is reused.
     * Use this to detect dangling references.
     * @returns {number}
     */
    get generation() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.jsentityid_generation(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Slot index (stable while entity lives and after slot is recycled)
     * @returns {number}
     */
    get index() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.jsentityid_index(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) JsEntityId.prototype[Symbol.dispose] = JsEntityId.prototype.free;

//#endregion

//#region wasm imports

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./gwen_core_bg.js": import0,
    };
}


//#endregion
const EngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_engine_free(ptr >>> 0, 1));
const JsEntityIdFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_jsentityid_free(ptr >>> 0, 1));


//#region intrinsics
function _assertNum(n) {
    if (typeof(n) !== 'number') throw new Error(`expected a number argument, found ${typeof(n)}`);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;


//#endregion

//#region wasm loading
let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('gwen_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
//#endregion
export { wasm as __wasm }
