# cli

Bun CLI package template (used by `@merossity/new`).

Built on [Clerc](https://www.npmjs.com/package/clerc) for commands, flags, help, and completions.

## Dev

```bash
bun run dev
```

## Build

```bash
bun run build
```

## QA

```bash
bun run --cwd packages/qa qa:init --dir . --kind cli
```

## Try It

```bash
bun run src/index.ts --help
bun run src/index.ts greet bun
```

Note: running `bun run src/index.ts` with no command typically starts the interactive mode (if implemented).
