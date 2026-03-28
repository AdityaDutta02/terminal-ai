import { ImageResponse } from 'next/og'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { loadFonts, OG_DIMENSIONS, COLORS } from '@/lib/og'
import sharp from 'sharp'

function wrapStyle() {
  return { display: 'flex', flexDirection: 'column' as const, width: '1200px', height: '630px', background: COLORS.bg, padding: '48px', fontFamily: 'Geist Sans' }
}
function headerStyle() {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }
}
function tagStyle() {
  return { background: COLORS.accent, color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '14px', fontWeight: 600 }
}
function brandStyle() {
  return { color: COLORS.secondaryText, fontSize: '18px', fontWeight: 700 }
}
function titleStyle() {
  return { color: COLORS.primaryText, fontSize: '52px', fontWeight: 700, lineHeight: 1.1, marginBottom: '16px' }
}
function descStyle() {
  return { color: COLORS.secondaryText, fontSize: '20px', marginBottom: 'auto' }
}
function footerStyle() {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: COLORS.secondaryText, fontSize: '15px' }
}
function authorStyle() {
  return { display: 'flex', alignItems: 'center', gap: '10px' }
}
function avatarStyle() {
  return { borderRadius: '50%', border: `2px solid ${COLORS.border}` }
}

type AppRow = {
  name: string
  description: string
  category: string
  framework: string
  display_name: string
  image: string | null
}

function buildImage(app: AppRow) {
  const desc = app.description ?? ''
  const truncated = desc.length > 100 ? desc.slice(0, 100) + '…' : desc
  return (
    <div style={wrapStyle()}>
      <div style={headerStyle()}>
        <span style={tagStyle()}>{app.category}</span>
        <span style={brandStyle()}>terminal ai</span>
      </div>
      <div style={titleStyle()}>{app.name}</div>
      <div style={descStyle()}>{truncated}</div>
      <div style={footerStyle()}>
        <div style={authorStyle()}>
          {app.image && (
            <img src={app.image} width={32} height={32} style={avatarStyle()} />
          )}
          <span>{app.display_name}</span>
        </div>
        <span>{app.framework}</span>
      </div>
    </div>
  )
}

function fontEntry(data: ArrayBuffer, weight: 400 | 700) {
  return { name: 'Geist Sans', data, weight }
}
function fontConfig(fonts: { regular: ArrayBuffer; bold: ArrayBuffer }) {
  return [fontEntry(fonts.regular, 400), fontEntry(fonts.bold, 700)]
}
const PNG_HEADERS = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' }
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const appId = searchParams.get('id')
  if (!appId) return new Response('Missing id', { status: 400 })
  const cacheKey = `og:app:${appId}`
  const cached = await redis.getBuffer(cacheKey)
  if (cached) return new Response(new Uint8Array(cached), { headers: PNG_HEADERS })
  const result = await db.query<AppRow>(
    `SELECT a.name, a.description, a.category, a.framework,
            u.name AS display_name, u.image
     FROM marketplace.apps a
     JOIN marketplace.channels ch ON ch.id = a.channel_id
     JOIN "user" u ON u.id = ch.creator_id
     WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [appId]
  )
  const app = result.rows[0]
  if (!app) return new Response('Not found', { status: 404 })
  const fonts = await loadFonts()
  const image = new ImageResponse(buildImage(app), { ...OG_DIMENSIONS, fonts: fontConfig(fonts) })
  const buffer = await sharp(Buffer.from(await image.arrayBuffer())).png({ compressionLevel: 9 }).toBuffer()
  await redis.set(cacheKey, buffer, 'EX', 3600)
  return new Response(new Uint8Array(buffer), { headers: PNG_HEADERS })
}
