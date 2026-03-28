import { describe, it, expect } from 'vitest'
import app from '../index'
describe('POST /upload', () => {
  it('rejects request without auth token', async () => {
    const form = new FormData()
    form.append('file', new Blob(['test'], { type: 'text/plain' }), 'test.txt')
    const res = await app.fetch(new Request('http://localhost/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(401)
  })
})
