import { notFound } from 'next/navigation'
import { db } from '@/lib/db'

type ChannelData = {
  name: string
  description: string | null
}
interface MetaCtx {
  channel: ChannelData
  slug: string
  base: string
  ogUrl: string
}
async function getChannelData(slug: string): Promise<ChannelData> {
  const result = await db.query<ChannelData>(
    'SELECT name, description FROM marketplace.channels WHERE slug = $1 AND deleted_at IS NULL',
    [slug]
  )
  if (!result.rows[0]) notFound()
  return result.rows[0]
}
function buildOgImage(url: string, alt: string) {
  return { url, width: 1200, height: 630, alt }
}
function ogBase(ctx: MetaCtx) {
  return { title: ctx.channel.name, description: ctx.channel.description, url: ctx.base + '/c/' + ctx.slug }
}
function buildOpenGraph(ctx: MetaCtx) {
  const img = buildOgImage(ctx.ogUrl, ctx.channel.name)
  return { ...ogBase(ctx), siteName: 'Terminal AI', images: [img], type: 'website' }
}
function buildTwitter(ctx: MetaCtx) {
  return { card: 'summary_large_image' as const, title: ctx.channel.name, description: ctx.channel.description, images: [ctx.ogUrl] }
}
function makeCtx(channel: ChannelData, slug: string, base: string): MetaCtx {
  return { channel, slug, base, ogUrl: base + '/api/og/channel?slug=' + slug }
}
function buildPageMeta(channel: ChannelData, slug: string, base: string) {
  const ctx = makeCtx(channel, slug, base)
  const og = buildOpenGraph(ctx)
  const tw = buildTwitter(ctx)
  return { title: `${channel.name} — Terminal AI`, description: channel.description, openGraph: og, twitter: tw }
}
export async function generateMetadata({ params }: { params: Promise<{ channelSlug: string }> }) {
  const { channelSlug } = await params
  const channel = await getChannelData(channelSlug)
  const base = process.env.NEXT_PUBLIC_APP_URL!
  return buildPageMeta(channel, channelSlug, base)
}

export default async function ChannelPage({ params }: { params: Promise<{ channelSlug: string }> }) {
  const resolved = await params
  const channel = await getChannelData(resolved.channelSlug)
  return (
    <main className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold text-white mb-4">{channel.name}</h1>
      {channel.description && (
        <p className="text-zinc-400 text-lg">{channel.description}</p>
      )}
    </main>
  )
}
