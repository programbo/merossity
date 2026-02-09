# Bun Monorepo Template

This repo exists to give you a fast, batteries‑included Bun workspace with a production‑ready React + Tailwind web app, plus opinionated scaffolding and QA tooling so every @bun-monorepo-template/new package starts clean.

Use it directly with `bun create`:

```bash
bun create programbo/bun-monorepo <PROJECT_NAME>
```

**Quick Start**

```bash
bun install
bun --cwd apps/web dev
```

Then open `http://localhost:3000/`.

**Highlights**

- **Default `web` app**: React + Tailwind, Bun dev server, hot reload, and a health‑checked startup with smart port handling.
- **Seamless dev server takeover**: If a matching app is already running on the default port, the @bun-monorepo-template/new process gracefully stops it and takes over without manual cleanup.
- **`packages/new`**: Scaffolds apps and packages with the repo’s QA defaults baked in.  
  Run: `bun run @bun-monorepo-template/new <web|api|cli|lib|ui>`
- **`packages/qa`**: Shared lint/format/typecheck configs and scripts used by every workspace.  
  Run: `bun run qa`

**Common Commands**

```bash
# Run all workspace dev servers (if present)
bun run dev

# Build the web app
bun --cwd apps/web run build

# Run the web app in production mode
bun --cwd apps/web run start
```

**Environment Variables**

Server control for the `web` app (development only):

- `PORT`: Base port for the dev server (default `3000`).
- `PORT_OFFSET`: Adds an offset to `PORT` (handy when running multiple instances).
- `NODE_ENV`: Set to `production` to disable dev features in `apps/web`. Server controls are intended for non‑production use only.

**Repo Defaults**

- Root lint config lives in `oxlint.json`.
- Formatting uses `prettier.config.cjs`.
- The `@bun-monorepo-template/new` scaffolder injects QA defaults into generated workspaces.
