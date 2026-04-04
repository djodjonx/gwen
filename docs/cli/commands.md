# CLI Commands

Full reference for every `gwen` CLI command. All commands read `gwen.config.ts` from the project root unless `--config` is specified.

## `gwen add`

Installs a GWEN module package and automatically registers it in `gwen.config.ts`. Uses the project's detected package manager (npm, pnpm, yarn, or bun).

```sh
gwen add <module-name> [--dev]
```

| Option            | Description                            |
| ----------------- | -------------------------------------- |
| `--dev`           | Install the package as a devDependency |
| `--config <path>` | Path to a custom `gwen.config.ts`      |

### Examples

```sh
gwen add @gwenjs/physics2d
gwen add @gwenjs/input
gwen add @gwenjs/debug --dev
```

After running `gwen add`, the module is added to `gwen.config.ts` under the `modules` key and installed in `node_modules`. You can then run `gwen prepare` to regenerate service type declarations.

---

## `gwen dev`

Starts the Vite development server with WASM hot-reload enabled.

```sh
gwen dev [options]
```

| Option            | Description                                      |
| ----------------- | ------------------------------------------------ |
| `--port <number>` | Port for the dev server (default: `3000`)        |
| `--host [string]` | Expose to a network host (e.g. `--host 0.0.0.0`) |
| `--config <path>` | Path to a custom `gwen.config.ts`                |

When a `.wasm` file changes (e.g. after a Rust recompile), the affected WASM module is hot-reloaded without a full page refresh. See [Extending Vite](../config/vite-extend.md#wasm-hot-reload) for details.

::: tip
Run `gwen prepare` at least once before `gwen dev` so that service types are available during development.
:::

---

## `gwen build`

Runs a production build via Vite + Rollup/Rolldown. WASM binaries are hashed, fingerprinted, and bundled alongside the JS output.

```sh
gwen build [options]
```

| Option            | Description                        |
| ----------------- | ---------------------------------- |
| `--mode <string>` | Vite mode (default: `production`)  |
| `--outDir <path>` | Output directory (default: `dist`) |
| `--config <path>` | Path to a custom `gwen.config.ts`  |

The build runs `hooks['build:before']` and `hooks['build:done']` from your `gwen.config.ts` before and after the Vite build step.

::: warning
Ensure your hosting environment sets the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers required by `SharedArrayBuffer`. The dev server handles this automatically; production does not.
:::

---

## `gwen preview`

Serves the production build locally so you can verify the output before deploying. Requires a prior `gwen build`.

```sh
gwen preview [options]
```

| Option            | Description                                   |
| ----------------- | --------------------------------------------- |
| `--port <number>` | Port for the preview server (default: `4173`) |
| `--host [string]` | Expose to a network host                      |

The preview server sets the same `SharedArrayBuffer` headers as `gwen dev`, so WASM modules work correctly.

---

## `gwen prepare`

Generates `.gwen/types/` — a directory of TypeScript declaration files that augment `GwenDefaultServices` with the service types exposed by your configured plugins.

```sh
gwen prepare [options]
```

| Option            | Description                       |
| ----------------- | --------------------------------- |
| `--config <path>` | Path to a custom `gwen.config.ts` |

### When to run it

Run `gwen prepare` whenever you:

- Add or remove a plugin in `gwen.config.ts`
- Update a plugin that exposes new services
- First set up a project

```sh
pnpm gwen prepare
```

In scaffolded projects, `gwen prepare` is wired to the `postinstall` script so it runs automatically after `pnpm install`.

### Output

After running, `.gwen/types/services.d.ts` will contain declarations like:

```ts
declare module '@gwenjs/core' {
  interface GwenDefaultServices {
    physics: import('@gwenjs/physics2d').Physics2DAPI;
    input: import('@gwenjs/input').InputAPI;
  }
}
```

This enables zero-cast service access throughout your project:

```ts
const physics = api.services.get('physics'); // typed as Physics2DAPI — no cast needed
```

::: tip
Commit `.gwen/types/` to source control so your team doesn't need to run `gwen prepare` after every clone.
:::
