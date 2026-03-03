# GWEN Documentation

GWEN is a composable web game framework with a Rust/WASM ECS core and TypeScript-first developer experience.

## Start Here

- [Getting Started](./GETTING_STARTED.md)
- [CLI Guide](./CLI.md)
- [API Reference](./API.md)
- [Architecture](./ARCHITECTURE.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

## Framework Mental Model

GWEN projects are typically structured like this:

```text
src/
  components/
  prefabs/
  scenes/
  systems/
  ui/
```

Workflow:

1. Configure plugins in `gwen.config.ts`
2. Define data in `components/`
3. Write gameplay logic in `systems/`
4. Orchestrate flow in `scenes/`
5. Run with `gwen dev`

## CLI-First Project Scaffolding

```bash
pnpm create @gwen/app my-game
cd my-game
pnpm dev
```

## More

- Main project README: [../README.md](https://github.com/djodjonx/gwen/blob/main/README.md)
- Contributing guide: [../CONTRIBUTING.md](https://github.com/djodjonx/gwen/blob/main/CONTRIBUTING.md)
- Security policy: [../SECURITY.md](https://github.com/djodjonx/gwen/blob/main/SECURITY.md)

