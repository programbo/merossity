import { serveWithControl } from './dev/serve-with-control'

const index = Bun.file(new URL('./index.html', import.meta.url))

const isProduction = process.env.NODE_ENV === 'production'

const applySecurityHeaders = (response: Response) => {
  if (!isProduction) return response

  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  )

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const json = (data: unknown, init?: ResponseInit) => applySecurityHeaders(Response.json(data, init))

const html = (body: BodyInit) => {
  const headers = new Headers()
  headers.set('Content-Type', 'text/html; charset=utf-8')
  return applySecurityHeaders(new Response(body, { headers }))
}

await serveWithControl({
  routes: {
    // Serve index.html for all unmatched routes.
    '/*': () => html(index),

    '/api/hello': {
      async GET(_req) {
        return json({
          message: 'Hello, world!',
          method: 'GET',
        })
      },
      async PUT(_req) {
        return json({
          message: 'Hello, world!',
          method: 'PUT',
        })
      },
    },

    '/api/hello/:name': async (req) => {
      const name = req.params.name
      return json({
        message: `Hello, ${name}!`,
      })
    },
  },

  development: process.env.NODE_ENV !== 'production' && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
})
