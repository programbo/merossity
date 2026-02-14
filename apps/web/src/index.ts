import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySecurityHeaders, createApiRoutes } from '@merossity/core/api'
import tailwindPlugin from 'bun-plugin-tailwind'
import { htmlContent } from 'node_modules/@merossity/core/src/api/shared'
import { serveWithControl } from './dev/serve-with-control'

const isProduction = process.env.NODE_ENV === 'production'

const srcDir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(srcDir, '..', 'dist')

const srcIndex = Bun.file(new URL('./index.html', import.meta.url))
const distIndex = Bun.file(path.join(distDir, 'index.html'))

const ensureDevBuild = async () => {
  if (isProduction) return

  const { readdir, stat } = await import('node:fs/promises')

  // The server runs with `bun --hot`, but the UI build is a separate Bun.build output in `dist/`.
  // If we only "build once", it's easy to accidentally serve stale UI assets (and miss UI changes).
  //
  // Set DEV_BUILD_ALWAYS=1 to force rebuild on every server start.
  const always = process.env.DEV_BUILD_ALWAYS === '1'

  const newestMtimeMs = async (dir: string): Promise<number> => {
    let newest = 0
    let entries: Array<import('node:fs').Dirent>
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return 0
    }

    for (const ent of entries) {
      const p = path.join(dir, ent.name)

      if (ent.isDirectory()) {
        // Avoid scanning the build output or dependencies.
        if (ent.name === 'dist' || ent.name === 'node_modules') continue
        newest = Math.max(newest, await newestMtimeMs(p))
        continue
      }

      // Only consider "UI-affecting" sources.
      if (!/\.(tsx?|css|html)$/.test(ent.name)) continue
      try {
        const s = await stat(p)
        newest = Math.max(newest, s.mtimeMs)
      } catch {
        // ignore
      }
    }

    return newest
  }

  const shouldBuild = async () => {
    if (always) return true
    if (!(await distIndex.exists())) return true

    try {
      const distStat = await stat(path.join(distDir, 'index.html'))
      const srcNewest = await newestMtimeMs(srcDir)
      return srcNewest > distStat.mtimeMs
    } catch {
      return true
    }
  }

  if (!(await shouldBuild())) return

  const result = await Bun.build({
    entrypoints: [path.join(srcDir, 'index.html')],
    outdir: distDir,
    plugins: [tailwindPlugin],
    minify: false,
    target: 'browser',
    sourcemap: 'linked',
    define: {
      'process.env.NODE_ENV': JSON.stringify('development'),
    },
  })

  if (!result.success) {
    // Best-effort: keep the server up so the UI can display API errors, even if the frontend build failed.
    console.warn(`⚠️ Dev build failed (${result.logs.length} logs). Serving source index.html fallback.`)
  }
}

await ensureDevBuild()

const index = (await distIndex.exists()) ? distIndex : srcIndex

const tryServeDistAsset = async (pathname: string): Promise<Response | null> => {
  // Serve built assets (e.g. /chunk-*.js, /chunk-*.css, sourcemaps).

  const clean = pathname.replace(/^\/+/, '')
  if (!clean) return null

  const file = Bun.file(path.join(distDir, clean))
  if (!(await file.exists())) return null
  return new Response(file)
}

// Watch for server-side code changes and restart in development
if (!isProduction) {
  const { watch, existsSync } = await import('node:fs')

  // Find the workspace root (where packages/core is located)
  let workspaceRoot = process.cwd()
  while (workspaceRoot !== path.dirname(workspaceRoot)) {
    if (existsSync(path.join(workspaceRoot, 'packages', 'core', 'src'))) {
      break
    }
    workspaceRoot = path.dirname(workspaceRoot)
  }

  const watchPaths = [
    srcDir, // Watch current package src (e.g., apps/web/src)
    path.join(workspaceRoot, 'packages', 'core', 'src'), // Watch @merossity/core/src
  ]

  for (const watchPath of watchPaths) {
    if (!existsSync(watchPath)) continue
    watch(watchPath, { recursive: true }, (event, filename) => {
      if (!filename) return
      // Only watch server-side files (.ts, .js), not UI files
      if (!/\.(ts|js|mjs|cjs)$/.test(filename)) return
      // Skip type declaration files
      if (filename.endsWith('.d.ts') || filename.endsWith('.d.mts') || filename.endsWith('.d.cts')) return
      console.log(`\n📝 Server code changed: ${filename} — restarting…`)
      process.exit(0) // Let concurrently restart the process
    })
  }
}

await serveWithControl({
  routes: {
    // Production: serve built assets (dist/*). All other unmatched routes return index.html for SPA navigation.
    '/*': async (req) => {
      const url = new URL(req.url)
      const asset = await tryServeDistAsset(url.pathname)
      if (asset) return applySecurityHeaders(asset)
      return htmlContent(index)
    },

    ...createApiRoutes(),
  },

  development: process.env.NODE_ENV !== 'production' && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
})
