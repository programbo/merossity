# @merossity/new

Scaffold apps and packages with consistent defaults.

## TL;DR

```bash
# From repo root (recommended)
bun run new web my-app

# Or call the package directly
bun run @merossity/new web my-app
bun run @merossity/new api my-api
bun run @merossity/new cli my-cli
bun run @merossity/new lib my-lib
bun run @merossity/new ui packages/neon-ui-2026
```

## What It Does

- `web`: `apps/<name>` via `bun init --react=tailwind`, then replaces the UI and runs `qa:init`.
- `api`: `apps/<name>` from local templates, then runs `qa:init`.
- `cli`: `packages/<name>` from local templates, then runs `qa:init`.
- `lib`: `packages/<name>` from local templates, then runs `qa:init`.
- `ui`: `packages/<name>` from local templates, then runs `qa:init` with Tailwind.
- All templates run `bun install` at the repo root when they finish scaffolding.
- Pass `--no-install` to skip the install.
- If you omit `<name>`, the template name is used (ex: `cli` -> `packages/cli`).

## Notes

- You can pass a full path like `packages/foo` to control the destination.
- Templates live in `packages/new/templates` and are exposed via the `.bun-create` symlink.
- Set `BUN_NEW_WEB_TEMPLATE=1` to scaffold web apps from the local template (useful for tests/offline work).
