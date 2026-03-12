# Troubleshooting & FAQ

## Installation Issues

### "Module '@djodjonx/gwen-engine-core' not found"

```
Cannot find module '@djodjonx/gwen-engine-core'
```

**Solutions:**

```bash
# Reinstall dependencies
rm -rf node_modules
pnpm install

# Verify the package exists
ls node_modules/@djodjonx/
```

---

### "pnpm: command not found"

```bash
npm install -g pnpm
```

---

## Build Issues

### "WASM module failed to load"

```
Failed to load WASM module
```

**Causes:**
- Project not built yet
- Wrong path in config

**Solution:**

```bash
pnpm build
```

---

## Runtime Issues

### "Entity has no component X" / undefined crash

Always guard component reads:

```typescript
const pos = api.getComponent(id, Position);
if (!pos) return;
// safe to use pos.x, pos.y here
```

---

### "Query returns empty but should have entities"

Check that all required components are actually added to the entity:

```typescript
const id = api.createEntity();
api.addComponent(id, Position, { x: 0, y: 0 });
api.addComponent(id, Velocity, { vx: 0, vy: 0 });

// Query matches only entities that have ALL listed components
const entities = api.query([Position, Velocity]);
```

---

### "Performance drops after N entities"

- Destroy entities when they leave the screen or die: `api.destroyEntity(id)`
- Make sure you are not leaking entity creation inside hot paths
- Check entity count in browser DevTools or via `@djodjonx/gwen-plugin-debug`

---

## Typing Issues

### `api.services.get(...)` returns `unknown` / not typed

Run `gwen prepare` (or `gwen dev`/`gwen build` which include it automatically).

This generates `.gwen/gwen.d.ts` with your project's service types from `gwen.config.ts`.

---

### "Cannot find name 'Position'"

Import your component:

```typescript
import { Position } from '../components';
```

---

## Development Issues

### "Port already in use"

```bash
gwen dev --port 3001
```

---

### "Hot reload not working"

```bash
# Hard-refresh browser
# Mac: Cmd+Shift+R
# Win/Linux: Ctrl+Shift+R
```

---

### "Linting errors persist"

```bash
pnpm format
pnpm lint --fix
```

---

## Common Pitfalls

### Forgetting `await` on async scene logic

Scene `onEnter` is synchronous by default. For async logic, schedule it explicitly.

### Modifying component data directly

Always use `api.addComponent` to write back, do not mutate the returned object.

```typescript
// ❌ Wrong — does not persist
const pos = api.getComponent(id, Position);
pos.x += 10;

// ✅ Correct
const pos = api.getComponent(id, Position);
if (!pos) return;
api.addComponent(id, Position, { ...pos, x: pos.x + 10 });
```

---

## FAQ

### Can I use GWEN with Three.js?

Yes — register a custom service in a plugin and consume it in `defineUI`.

### Can I use external npm packages?

Yes, install as usual with `pnpm add <package>`.

### Is GWEN mobile-friendly?

GWEN targets modern web browsers including mobile. Performance depends on device.

### Can I use GWEN inside React or Vue?

Yes — create the engine inside a `useEffect` / `onMounted` and call `engine.stop()` on cleanup.

---

## Getting Help

- [GitHub Issues](https://github.com/djodjonx/gwen/issues)
- [GitHub Discussions](https://github.com/djodjonx/gwen/discussions)
