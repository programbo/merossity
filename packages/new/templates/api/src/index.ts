import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (context) => context.json({ ok: true }))

app.get('/api/hello', (context) =>
  context.json({
    message: 'Hello, world!',
  }),
)

app.get('/api/hello/:name', (context) => {
  const name = context.req.param('name')
  return context.json({
    message: `Hello, ${name}!`,
  })
})

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001)
  Bun.serve({
    fetch: app.fetch,
    port,
  })
  console.log(`API server listening on http://localhost:${port}`)
}

export default app
