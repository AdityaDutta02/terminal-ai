import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { putObject, getPublicUrl } from '@/lib/storage'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { randomUUID } from 'crypto'
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
function allowedType(ct: string): boolean {
  return ALLOWED_TYPES.some((t) => ct.startsWith(t))
}
export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rl = await rateLimit(`upload:${session.user.id}`, 20, 3600)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  const contentType = req.headers.get('content-type') ?? ''
  if (!allowedType(contentType)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 415 })
  }
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 })
  }
  try {
    const buffer = Buffer.from(await req.arrayBuffer())
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 })
    }
    const ext = contentType.split('/')[1]?.split(';')[0] ?? 'jpg'
    const key = `uploads/${session.user.id}/${randomUUID()}.${ext}`
    await putObject(key, buffer, contentType)
    const url = getPublicUrl(key)
    logger.info({ msg: 'file_uploaded', userId: session.user.id, key, size: buffer.byteLength })
    return NextResponse.json({ url, key })
  } catch (err) {
    logger.error({ msg: 'upload_failed', err: String(err) })
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
