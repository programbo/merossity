import { describe, expect, it } from 'bun:test'
import app from '../src/index'

describe('api', () => {
  it('serves health status', async () => {
    const response = await app.request('/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('serves hello world', async () => {
    const response = await app.request('/api/hello')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'Hello, world!' })
  })

  it('serves named hello', async () => {
    const response = await app.request('/api/hello/Bun')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'Hello, Bun!' })
  })
})
