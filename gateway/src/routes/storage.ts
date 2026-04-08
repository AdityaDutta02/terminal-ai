import { Hono } from 'hono'
import { embedTokenAuth } from '../middleware/auth.js'
import { storageUpload, storageGet, storageList, storageDelete } from '../services/minio.js'
import { scanBuffer } from '../services/clamav.js'
import { logger } from '../lib/logger.js'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const storageRouter = new Hono()
storageRouter.use('*', embedTokenAuth)

// GET /storage — list files
storageRouter.get('/', async (c) => {
  const { appId } = c.get('embedToken')
  try {
    const files = await storageList(appId)
    return c.json(files)
  } catch (err) {
    logger.error({ msg: 'storage_list_error', appId, err: String(err) })
    return c.json({ error: 'List failed' }, 500)
  }
})

// PUT /storage/:key — upload (handles nested keys like folder/file.pdf)
storageRouter.put('/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const key = c.req.param('key')
  const contentType = c.req.header('Content-Type') ?? 'application/octet-stream'
  const contentLength = parseInt(c.req.header('Content-Length') ?? '0', 10)

  if (contentLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'File too large (max 50MB)' }, 413)
  }

  try {
    const buffer = Buffer.from(await c.req.arrayBuffer())
    if (buffer.length > MAX_UPLOAD_BYTES) return c.json({ error: 'File too large (max 50MB)' }, 413)

    const scan = await scanBuffer(buffer, key)
    if (!scan.clean) {
      logger.warn({ msg: 'storage_upload_blocked', appId, key, virus: scan.virusName })
      return c.json({ error: 'File blocked by security scanner' }, 422)
    }

    await storageUpload({ appId, key, buffer, contentType })
    return c.json({ key, uploaded: true }, 201)
  } catch (err) {
    logger.error({ msg: 'storage_upload_error', appId, key, err: String(err) })
    return c.json({ error: 'Upload failed' }, 500)
  }
})

// GET /storage/:key — download (handles nested keys)
storageRouter.get('/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const key = c.req.param('key')
  try {
    const { buffer, contentType } = await storageGet(appId, key)
    return new Response(buffer, { headers: { 'Content-Type': contentType } })
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'NOT_FOUND') {
      return c.json({ error: 'File not found' }, 404)
    }
    logger.error({ msg: 'storage_get_error', appId, key, err: String(err) })
    return c.json({ error: 'Download failed' }, 500)
  }
})

// DELETE /storage/:key
storageRouter.delete('/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const key = c.req.param('key')
  try {
    await storageDelete(appId, key)
    return c.json({ deleted: true })
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'NOT_FOUND') {
      return c.json({ error: 'File not found' }, 404)
    }
    logger.error({ msg: 'storage_delete_error', appId, key, err: String(err) })
    return c.json({ error: 'Delete failed' }, 500)
  }
})

export { storageRouter }
