# @merossity/cli

Merossity CLI (Clerc + Ink TUI).

## Quick Start (No Build Step)

From repo root:

```bash
bun install
bun run --cwd packages/cli src/index.ts --help
```

## Common Commands

```bash
# Simple smoke test
bun run --cwd packages/cli src/index.ts greet bun

# Start the TUI (runs when no command is provided)
bun run --cwd packages/cli src/index.ts

# List devices from a Meross cloud dump JSON file
bun run --cwd packages/cli src/index.ts meross:devices --dump ~/.config/merossity/meross-cloud-dump.json
```

## Meross LAN Control

The LAN commands require a Meross key (`MEROSS_KEY` or `--key`) and a device host (`--host` or `--mac`).

```bash
MEROSS_KEY="..." bun run --cwd packages/cli src/index.ts meross:togglex --host 192.168.1.42 --on
MEROSS_KEY="..." bun run --cwd packages/cli src/index.ts meross:systemall --host 192.168.1.42
```

If you only have a MAC, you can attempt resolution via neighbor tables, and optionally ping-sweep a CIDR first:

```bash
MEROSS_KEY="..." bun run --cwd packages/cli src/index.ts meross:togglex --mac aa:bb:cc:dd:ee:ff --sweep --subnet 192.168.1.0/24 --off
```

## Environment Variables

- `MEROSS_KEY`: Meross key for LAN requests
- `MEROSS_DUMP`: path to a Meross cloud dump JSON (used by `meross:devices` and the TUI)

## Dev / Build

```bash
# Watch build + run built dist output
bun run --cwd packages/cli dev

# Build once
bun run --cwd packages/cli build
```
