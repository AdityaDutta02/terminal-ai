import { ImageResponse } from 'next/og'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { loadFonts, OG_DIMENSIONS, COLORS } from '@/lib/og'
import sharp from 'sharp'

function headerStyle() {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }
}
function authorStyle() {
  return { display: 'flex', alignItems: 'center', gap: '16px' }
}
function avatarStyle() {
  return { borderRadius: '50%', border: `2px solid ${COLORS.border}` }
}
function nameStyle() {
  return { color: COLORS.primaryText, fontSize: '18px', fontWeight: 600 }
}
function handleStyle() {
  return { color: COLORS.secondaryText, fontSize: '14px' }
}
function brandStyle() {
  return { color: COLORS.secondaryText, fontSize: '20px', fontWeight: 700 }
}
function titleStyle() {
  return { color: COLORS.primaryText, fontSize: '48px', fontWeight: 700, lineHeight: 1.1, marginBottom: '16px' }
}
function descStyle() {
  return { color: COLORS.secondaryText, fontSize: '20px', marginBottom: 'auto' }
}
function footerStyle() {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: COLORS.secondaryText, fontSize: '16px' }
}
function badgeStyle() {
  return { background: COLORS.accent, color: '#fff', padding: '6px 16px', borderRadius: '8px', fontSize: '16px', fontWeight: 600 }
}
function wrapStyle() {
  return { display: 'flex', flexDirection: 'column' as const, width: '1200px', height: '630px', background: COLORS.bg, padding: '48px', fontFamily: 'Geist Sans' }
}

type ChannelRow = {
  name: string
  description: string
  display_name: string
  avatar_url: string | null
  subscriber_count: string
  min_price: string | null
}

function buildImage(channel: ChannelRow, slug: string) {
  const desc = channel.description ?? ''
  const truncated = desc.length > 80 ? desc.slice(0, 80) + '…' : desc
  const priceLabel = channel.min_price ? `from ₹${(Number(channel.min_price) / 100).toFixed(0)}/month` : null
  return (
    <div style={wrapStyle()}>
      <div style={headerStyle()}>
        <div style={authorStyle()}>
          {channel.avatar_url && (
            <img src={channel.avatar_url} width={56} height={56} style={avatarStyle()} />
          )}
          <div>
            <div style={nameStyle()}>{channel.display_name}</div>
            <div style={handleStyle()}>@{slug}</div>
          </div>
        </div>
        <div style={brandStyle()}>terminal ai</div>
      </div>
      <div style={titleStyle()}>{channel.name}</div>
      <div style={descStyle()}>{truncated}</div>
      <div style={footerStyle()}>
        <span>● {channel.subscriber_count} subscribers</span>
        {priceLabel && <span style={badgeStyle()}>{priceLabel}</span>}
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
  const slug = searchParams.get('slug')
  if (!slug) return new Response('Missing slug', { status: 400 })
  const cacheKey = `og:channel:${slug}`
  const cached = await redis.getBuffer(cacheKey)
  if (cached) return new Response(new Uint8Array(cached), { headers: PNG_HEADERS })
  const result = await db.query<ChannelRow>(
    `SELECT ch.name, ch.description, u.display_name, u.avatar_url,
            COUNT(DISTINCT s.id) as subscriber_count,
            MIN(pl.price_inr) as min_price
     FROM marketplace.channels ch
     JOIN auth.users u ON u.id = ch.creator_id
     LEFT JOIN subscriptions.subscriptions s ON s.channel_id = ch.id AND s.status = 'active'
     LEFT JOIN subscriptions.plans pl ON pl.channel_id = ch.id
     WHERE ch.slug = $1 AND ch.deleted_at IS NULL
     GROUP BY ch.name, ch.description, u.display_name, u.avatar_url`,
    [slug]
  )
  const channel = result.rows[0]
  if (!channel) return new Response('Not found', { status: 404 })
  const fonts = await loadFonts()
  const image = new ImageResponse(buildImage(channel, slug), { ...OG_DIMENSIONS, fonts: fontConfig(fonts) })
  const buffer = await sharp(Buffer.from(await image.arrayBuffer())).png({ compressionLevel: 9 }).toBuffer()
  await redis.set(cacheKey, buffer, 'EX', 3600)
  return new Response(buffer, { headers: PNG_HEADERS })
}
