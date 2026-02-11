import path from 'node:path'

export async function loadEnvFromRootIfPresent(): Promise<void> {
  // Bun loads .env from the current working directory. In this monorepo, the
  // secrets are often stored at repo root, while `apps/web` runs with cwd=apps/web.
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ]

  for (const p of candidates) {
    try {
      const text = await Bun.file(p).text()
      if (!text.trim()) continue
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue

        // Support `export KEY='value'` (as in the user's .env) and `KEY=value`.
        const cleaned = line.startsWith('export ') ? line.slice('export '.length).trim() : line
        const eq = cleaned.indexOf('=')
        if (eq <= 0) continue

        const key = cleaned.slice(0, eq).trim()
        let value = cleaned.slice(eq + 1).trim()
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1)
        }

        if (!key) continue
        if (process.env[key] === undefined) process.env[key] = value
      }
      return
    } catch {
      // ignore
    }
  }
}
