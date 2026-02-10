# @merossity/qa

Shared QA config for the monorepo (Prettier, Oxlint, TypeScript).

## TL;DR

```bash
bun run qa

# Initialize QA wiring for a workspace
bun run --cwd packages/qa qa:init --dir apps/web --kind web --tailwind
bun run --cwd packages/qa qa:init --dir packages/cli --kind cli
bun run --cwd packages/qa qa:init --dir packages/lib --kind lib
bun run --cwd packages/qa qa:init apps/web --kind web --tailwind
```

## What It Does

`qa:init` wires:

- `prettier.config.cjs`
- `oxlint.json`
- `tsconfig.json` (preset based on project type)
- `lint`, `format`, `typecheck` scripts

## Options

- `--dir <path>` (optional; or pass the path as the first argument)
- `--kind web|cli|lib|auto` (default: `auto`)
- `--tailwind` (forces Tailwind Prettier config)
- `--force` (overwrite existing config files)

## Presets

Exported presets:

- `@merossity/qa/tsconfig` (base)
- `@merossity/qa/tsconfig/node`
- `@merossity/qa/tsconfig/web`
- `@merossity/qa/tsconfig/react-lib`

`qa:init` uses:

- `web` → `@merossity/qa/tsconfig/web`
- `cli`/`lib` → `@merossity/qa/tsconfig/node`
- React library packages → `@merossity/qa/tsconfig/react-lib`

## Testkit

`@merossity/qa/testkit` provides lightweight helpers for Bun tests:

- process helpers (`spawnProcess`, `waitForOutput`)
- server helpers (`startServer`, `waitForUrl`, `getFreePort`)
- http helpers (`fetchJson`, `fetchText`)
- artifact helpers (`writeArtifact`, `writeJsonArtifact`)

Example:

```ts
import { startServer } from '@merossity/qa/testkit'
import { fetchJson } from '@merossity/qa/testkit'

const server = await startServer({ command: 'bun', args: ['src/index.ts'], cwd: process.cwd() })
await server.ready
const { json } = await fetchJson<{ message: string }>(`${server.url}/api/hello`)
await server.stop()
```

## Heuristics (when `--kind auto`)

- `web` if `react`, `react-dom`, `next`, or `vite` is present
- `cli` if `bin` is present or name contains `cli`
- otherwise `lib`
- Tailwind is enabled automatically if `tailwindcss` is present

## Manual Setup (Rare)

If you need to wire configs by hand, see the templates used by `qa:init` in `packages/qa`.
