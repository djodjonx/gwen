# 🆘 Troubleshooting & FAQ

## Installation Issues

### "wasm-pack not found"

**Error:**
```
wasm-pack: command not found
```

**Solution:**
```bash
cargo install wasm-pack
```

Then verify:
```bash
wasm-pack --version
```

---

### "rustup not found"

**Error:**
```
rustup: command not found
```

**Solution:** Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Follow the on-screen instructions, then restart your terminal.

---

### "pnpm: command not found"

**Error:**
```
pnpm: command not found
```

**Solution:**
```bash
npm install -g pnpm
```

Verify:
```bash
pnpm --version
```

---

### "Module '@djodjonx/gwen-engine-core' not found"

**Error:**
```
Cannot find module '@djodjonx/gwen-engine-core'
```

**Causes:**
1. Dependencies not installed
2. Link not established
3. TypeScript path issue

**Solutions:**

```bash
# 1. Reinstall dependencies
rm -rf node_modules
pnpm install

# 2. Rebuild links
pnpm install --recursive

# 3. Clear cache
pnpm store prune
```

---

## Build Issues

### "WASM module failed to load"

**Error:**
```
Failed to load WASM module
```

**Causes:**
- WASM file not built
- Path incorrect
- File corrupted

**Solutions:**

```bash
# 1. Verify WASM file exists
ls packages/@djodjonx/gwen-engine-core/wasm/

# 2. Rebuild WASM
pnpm build

# 3. Check file size (should be > 100KB)
ls -lh packages/@djodjonx/gwen-engine-core/wasm/gwen_core_bg.wasm
```

---

### "Compile error in Rust"

**Error:**
```
error: failed to compile `gwen-core`
```

**Solutions:**

```bash
# 1. Update Rust
rustup update

# 2. Add WASM target
rustup target add wasm32-unknown-unknown

# 3. Clean and rebuild
cargo clean
pnpm build
```

---

### "Cannot find Cargo.toml"

**Error:**
```
error: couldn't find Cargo.toml in `/Users/.../crates/gwen-core`
```

**Solution:**
```bash
# Make sure you're in the right directory
ls crates/gwen-core/Cargo.toml

# Then rebuild
pnpm build
```

---

## Runtime Issues

### "Entity has no component X"

**Problem:**
```typescript
const pos = engine.getComponent(entity, Position);
console.log(pos.x); // Crashes: Cannot read property 'x' of undefined
```

**Solution:** Always check if component exists

```typescript
const pos = engine.getComponent(entity, Position);
if (pos) {
  console.log(pos.x);
} else {
  console.warn('Entity has no Position component');
}
```

---

### "Performance drops after N entities"

**Causes:**
- Query not cached
- Memory not being freed (entities not destroyed)
- Too many active plugins

**Solutions:**

```typescript
// 1. Cache query results
const entities = engine.query([Position, Velocity]);
for (const [id, pos, vel] of entities) {
  // ...
}

// 2. Destroy entities when done
engine.destroyEntity(oldEntity);

// 3. Disable unused plugins
engine.removeSystem('UnusedPlugin');

// 4. Profile with browser DevTools
// F12 → Performance → Record → [run game] → Stop
```

---

### "Memory leak - memory keeps growing"

**Causes:**
- Entities created but not destroyed
- JavaScript closures holding references
- WASM memory not cleaned

**Solutions:**

```typescript
// 1. Destroy entities
const enemy = engine.createEntity();
// ... later ...
engine.destroyEntity(enemy);

// 2. Check entity count
console.log(engine.getEntityCount());

// 3. Stop engine when done
engine.stop();

// 4. Monitor in DevTools
// Chrome DevTools → Memory → Heap Snapshots
```

---

### "Query returns empty but should have entities"

**Causes:**
- Component names don't match
- Entities don't have all required components
- Component removed by accident

**Solutions:**

```typescript
// 1. Verify entity has components
const entity = engine.createEntity();
engine.addComponent(entity, Position, { x: 0, y: 0 });

console.log(engine.hasComponent(entity, Position)); // should be true

// 2. Check component name
const entities = engine.query(['Position', 'Velocity']);

// 3. Use component definition, not string
const entities = engine.query([Position, Velocity]);
```

---

## Development Issues

### "Hot reload not working"

**Problem:** Changes don't reflect in browser

**Solutions:**

```bash
# 1. Check dev server is running
pnpm dev

# 2. Clear browser cache
# Chrome: DevTools → Network → Disable cache (or Cmd+Shift+Delete)

# 3. Hard refresh
# Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)

# 4. Check file was saved
# Should see "WASM rebuilt" in terminal
```

---

### "Port 5173 already in use"

**Error:**
```
Port 5173 already in use
```

**Solutions:**

```bash
# 1. Use different port
pnpm dev -- --port 3000

# 2. Kill process using port (Mac/Linux)
lsof -i :5173
kill -9 <PID>

# 3. Use different port on Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

---

### "Linting errors won't go away"

**Problem:** `pnpm lint:fix` doesn't fix everything

**Solutions:**

```bash
# 1. Manual fix
pnpm lint

# Then fix issues manually, or:

# 2. Format first
pnpm format

# 3. Then lint
pnpm lint:fix

# 4. Check for TypeScript errors
pnpm typecheck
```

---

### "Tests failing after changes"

**Solutions:**

```bash
# 1. Run single test file
cd packages/@djodjonx/gwen-engine-core
pnpm test tests/my-test.test.ts

# 2. Watch mode
pnpm test --watch

# 3. Debug in browser
# Tests run in jsdom, check DevTools console

# 4. Update snapshots
pnpm test -u
```

---

## TypeScript Issues

### "Type 'X' is not assignable to type 'Y'"

**Problem:**
```typescript
const pos: Position = { x: "100", y: 50 }; // Error: x is string not number
```

**Solution:** Check types match

```typescript
const pos: Position = { x: 100, y: 50 }; // ✓ Correct
```

---

### "Cannot find name 'Position'"

**Problem:**
```typescript
const pos = engine.getComponent(entity, Position); // Error: Position not found
```

**Solution:** Import the component

```typescript
import { Position } from './components/Position';

const pos = engine.getComponent(entity, Position);
```

---

### "Property 'x' does not exist on type 'unknown'"

**Problem:**
```typescript
const pos = engine.getComponent(entity, Position);
console.log(pos.x); // Error: pos could be undefined
```

**Solution:** Use type guard

```typescript
const pos = engine.getComponent<typeof Position>(entity, Position);
if (pos) {
  console.log(pos.x);
}
```

---

## Browser Issues

### "Game doesn't render"

**Checklist:**
- [ ] Canvas element exists in HTML
- [ ] Renderer plugin registered
- [ ] `engine.start()` called
- [ ] No JavaScript errors (DevTools console)
- [ ] WASM loaded (Network tab)

---

### "Game is 60x slower than expected"

**Causes:**
- Renderer not hardware accelerated
- Query not cached
- Profiling code left in

**Solutions:**

```bash
# 1. Profile in DevTools
# F12 → Performance → Record → play game → Stop

# 2. Look for bottlenecks
# Should see plugins taking < 5ms each

# 3. Check hardware accel
# chrome://gpu
```

---

### "Works on Mac but not Windows"

**Common issues:**
- Path separators (\ vs /)
- Line endings (CRLF vs LF)
- Case-sensitive imports

**Solutions:**

```typescript
// ✓ Use forward slashes
import { Position } from './components/Position';

// ✗ Don't use backslashes
import { Position } from '.\\components\\Position';

// ✓ Use exact casing
import { Position } from './components/Position';

// ✗ Don't mix casing
import { Position } from './Components/position';
```

---

## Getting Help

If your issue isn't listed here:

1. **Search existing issues** → [GitHub Issues](https://github.com/djodjonx/gwen/issues)
2. **Ask in Discussions** → [GitHub Discussions](https://github.com/djodjonx/gwen/discussions)
3. **Check docs** → [Documentation](./API.md)
4. **Read architecture** → [Architecture Guide](./ARCHITECTURE.md)

**When reporting issues, include:**
- ✅ Error message (full text)
- ✅ Steps to reproduce
- ✅ Your environment (OS, Node version, etc.)
- ✅ Relevant code snippet
- ✅ What you expected vs what happened

---

## FAQ

### Q: Can I use GWEN with existing Three.js code?

**A:** Yes! You can create a renderer plugin that uses Three.js. See `@djodjonx/gwen-renderer-canvas2d` for an example.

---

### Q: How do I load assets (images, audio)?

**A:** Use browser APIs or npm packages:

```typescript
// Images
const img = new Image();
img.src = '/path/to/image.png';

// Audio
const audio = new Audio('/path/to/sound.mp3');
audio.play();

// Or use plugins
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
```

---

### Q: Can I use external npm packages?

**A:** Yes, GWEN is compatible with any npm package. Add via:

```bash
pnpm add some-package
```

---

### Q: How do I debug WASM code?

**A:** Use browser DevTools:

```bash
# Build with debug symbols
cargo build --target wasm32-unknown-unknown
```

Then in Chrome DevTools (Sources tab), you can step through WASM.

---

### Q: Is GWEN suitable for mobile?

**A:** Yes! WASM works on mobile browsers. Performance may vary.

---

### Q: Can I use GWEN with React/Vue?

**A:** Yes, GWEN runs in any browser. You can wrap it in React/Vue if needed.

```typescript
// React component
import { useEffect, useRef } from 'react';
import { Engine } from '@djodjonx/gwen-engine-core';

export function GameCanvas() {
  const canvasRef = useRef();

  useEffect(() => {
    const engine = new Engine();
    engine.start();

    return () => engine.stop();
  }, []);

  return <canvas ref={canvasRef} />;
}
```

---

**Happy debugging!** 🐛


