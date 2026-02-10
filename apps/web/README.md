# Merossity Web App (`apps/web`)

Single-page React app plus a Bun server that exposes a small JSON API for:

- Meross cloud login (supports MFA/TOTP) and device inventory refresh
- Local config persistence at `~/.config/merossity/config.json` (override with `MEROSS_CONFIG_PATH`)
- Resolving LAN hosts by MAC (optional CIDR ping-sweep)
- LAN control calls (`Appliance.Control.ToggleX`, `Appliance.System.All`)

## Setup

From repo root:

```bash
bun install
```

## Development

From repo root:

```bash
bun run --cwd apps/web dev
```

Or from `apps/web`:

```bash
bun dev
```

## Configuration

- `MEROSS_EMAIL`, `MEROSS_PASSWORD`: optional defaults for cloud login (you can also type in the UI)
- `MEROSS_KEY`: optional fallback LAN key if you do not log in via cloud
- `MEROSS_CONFIG_PATH`: override config path (default `~/.config/merossity/config.json`)
- `PORT`, `PORT_OFFSET`: control dev server port selection

Note: `apps/web` will try to load a `.env` from the repo root automatically.

## Ports

Default port is `3000`. If it is in use, the server increments by 1 until a free port is found.

## Restart Signaling (Dev)

The server listens on a local Unix socket at `.dev/<package-name>-<hash>.sock` and accepts:

- `restart`: restart the server in-place
- `stop`: stop the server

Example:

```bash
printf restart | nc -U .dev/<package-name>-<hash>.sock
```

When running in a TTY, you can also press `r` to restart or `q` to stop.

## Production

From repo root:

```bash
bun run --cwd apps/web build
bun run --cwd apps/web start
```

Or from `apps/web`:

```bash
bun run build
bun start
```
