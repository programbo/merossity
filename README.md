# Merossity

Merossity is a small web app plus a CLI for interacting with Meross devices: store cloud credentials locally, inspect your device inventory, resolve LAN hosts, and toggle devices on your network.

## Web App (apps/web)

**What it does**

- Cloud login (supports MFA/TOTP) and device inventory refresh
- Local-first config storage at `~/.config/merossity/config.json` (override with `MEROSS_CONFIG_PATH`)
- LAN host resolution by MAC address (optional CIDR ping-sweep to populate neighbor tables)
- LAN control: `Appliance.System.All` and `Appliance.Control.ToggleX`

**Start it**

```bash
bun install
bun run --cwd apps/web dev
```

Open `http://localhost:3000` (if `3000` is taken, the server will increment until it finds a free port).

**Configuration**

- `MEROSS_EMAIL`, `MEROSS_PASSWORD`: optional defaults for cloud login (can also enter in the UI)
- `MEROSS_KEY`: optional fallback for LAN control if you do not log in via cloud
- `MEROSS_CONFIG_PATH`: override config location (default `~/.config/merossity/config.json`)
- `PORT`, `PORT_OFFSET`: dev server port controls

Note: `apps/web` will try to load a `.env` from the repo root automatically, even when you run the server from `apps/web`.

## CLI (packages/cli)

The CLI is designed to run directly from source (no build step required).

**Easy start**

```bash
# show help (does not start the TUI)
bun run --cwd packages/cli src/index.ts --help

# run a simple command
bun run --cwd packages/cli src/index.ts greet bun
```

**TUI**

Running the CLI with no command starts the Ink TUI:

```bash
bun run --cwd packages/cli src/index.ts
```

The TUI expects a Meross cloud dump JSON at `~/.config/merossity/meross-cloud-dump.json` (override with `MEROSS_DUMP`).

**Meross LAN commands**

```bash
# Toggle on/off via LAN (/config). Provide exactly one of --on/--off.
MEROSS_KEY="..." bun run --cwd packages/cli src/index.ts meross:togglex --host 192.168.1.42 --on

# If you only have a MAC, attempt to resolve IP via neighbor tables; optionally sweep a CIDR first.
MEROSS_KEY="..." bun run --cwd packages/cli src/index.ts meross:togglex --mac aa:bb:cc:dd:ee:ff --sweep --subnet 192.168.1.0/24 --off

# Fetch Appliance.System.All
MEROSS_KEY="..." bun run --cwd packages/cli src/index.ts meross:systemall --host 192.168.1.42
```

## Repo Commands

```bash
# Run lint + typecheck + format across workspaces
bun run qa

# Build all workspaces (if present)
bun run build
```
