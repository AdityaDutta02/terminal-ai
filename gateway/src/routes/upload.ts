import { Hono } from 'hono'
import { scanBuffer } from '../services/clamav.js'
import { compressFile } from '../services/compress.js'
import { uploadFile, getPublicUrl } from '../services/minio.js'
import { embedTokenAuth } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'
function isAllowedMime(mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return true
  if (mimeType === 'image/png') return true
  if (mimeType === 'image/webp') return true
  if (mimeType === 'image/gif') return true
  if (mimeType === 'application/pdf') return true
  if (mimeType === 'text/plain') return true
  if (mimeType === 'text/csv') return true
  return false
}
export const uploadRouter = new Hono()
uploadRouter.post('/', embedTokenAuth, async (c) => {
  const payload = c.get('embedToken')
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'No file provided' }, 400)
  if (!isAllowedMime(file.type)) return c.json({ error: 'File type not allowed' }, 422)
  if (file.size > 50 * 1024 * 1024) return c.json({ error: 'File too large (max 50MB)' }, 422)
  const buffer = Buffer.from(await file.arrayBuffer())
  const scan = await scanBuffer(buffer, file.name)
  if (!scan.clean) {
    logger.warn({ msg: 'malware_detected', userId: payload.userId, appId: payload.appId, virus: scan.virusName })
    return c.json({ error: 'File blocked by security scanner' }, 422)
  }
  const { buffer: compressed, contentType } = await compressFile(buffer, file.type)
  const key = await uploadFile({
    appId: payload.appId,
    userId: payload.userId,
    filename: file.name,
    buffer: compressed,
    contentType,
  })
  const publicUrl = getPublicUrl(key)
  logger.info({ msg: 'file_uploaded', userId: payload.userId, appId: payload.appId, size: compressed.length })
  return c.json({ key, url: publicUrl, contentType, size: compressed.length })
})
