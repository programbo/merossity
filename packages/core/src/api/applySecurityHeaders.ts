const isProduction = process.env.NODE_ENV === 'production'

export function applySecurityHeaders(response: Response): Response {
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
      // Allow Google Fonts for the UI typography. This is only enabled in production.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data:",
      "font-src 'self' data: https://fonts.gstatic.com",
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
