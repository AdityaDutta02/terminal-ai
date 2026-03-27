# Terminal AI — Social Sharing & OG Image System

**Version:** 1.0
**Date:** 2026-03-27

---

## 1. Overview

Every channel and app page generates a dynamic Open Graph preview image for rich social sharing. No new service required — implemented entirely within the Next.js BFF using Satori (JSX→SVG) and resvg-js (SVG→PNG).

**Shared entities:**
- Channel pages: `terminalai.app/c/[channel-slug]`
- App detail pages: `terminalai.app/c/[channel-slug]/[app-slug]`

**What non-subscribers see at a shared link:**
Full public detail page — name, description, pricing, screenshots, demo CTA. No app access without subscribing. Sharing is a marketing mechanism, not an access mechanism.

---

## 2. OG Image Generation

### Technology
```
Satori:    JSX → SVG (open source, @vercel/satori)
resvg-js:  SVG → PNG (Rust-based, fast, high quality)
Sharp:     PNG optimisation (compress before serving)

Route:     app/api/og/channel/route.tsx
           app/api/og/app/route.tsx
Output:    image/png, 1200×630px (standard OG size)
Cache:     Redis key og:{type}:{slug} → PNG buffer, 1h TTL
           Cloudflare CDN: Cache-Control public, max-age=3600
Invalidation: On channel/app name, thumbnail, or subscriber count change
              → Redis key deleted → next request regenerates
```

### Channel OG Image

```
┌──────────────────────────────────────────────────────────────────┐ 1200px
│                                                                  │
│  [Channel banner image — full width, darkened overlay 50%]      │
│                                                                  │
│  ┌────┐                                          ┌────────────┐  │
│  │    │  Creator Display Name                    │terminal ai │  │
│  │ av │  @channel-slug                           │ · · ·      │  │
│  └────┘                                          └────────────┘  │
│                                                                  │
│  "Channel Name in 48px Bold Geist Sans"                         │
│                                                                  │
│  Short description, max 80 chars, truncated with ellipsis       │
│                                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  +8 more apps             │
│  │ app  │ │ app  │ │ app  │ │ app  │                            │
│  │thumb │ │thumb │ │thumb │ │thumb │                            │
│  └──────┘ └──────┘ └──────┘ └──────┘                            │
│                                                                  │
│  ● 47 subscribers                              from ₹299/month  │
└──────────────────────────────────────────────────────────────────┘
                                                               630px
Colours:
  Background: dark (zinc-950 #09090b) with banner overlay
  Primary text: white
  Secondary text: zinc-400
  Accent: brand purple (#7c3aed) for price badge
  Font: Geist Sans (loaded from MinIO at render time)
```

### App OG Image

```
┌──────────────────────────────────────────────────────────────────┐ 1200px
│                                                                  │
│  [Dark gradient background, brand colour accent strip left side] │
│                                                                  │
│  ┌──────────────────┐                                            │
│  │                  │   "App Name in 52px Bold Geist Sans"      │
│  │                  │                                            │
│  │   App Thumbnail  │   By Creator Name                         │
│  │   (square, 280px)│                                            │
│  │                  │   [Category Badge]  [Mobile ✓ optional]   │
│  │                  │                                            │
│  └──────────────────┘   Short description, max 100 chars        │
│                                                                  │
│                          ─────────────────────────────           │
│                                                                  │
│  ~10 credits per use                      from ₹99/month        │
│                                              ┌────────────┐     │
│                                              │terminal ai │     │
│                                              └────────────┘     │
└──────────────────────────────────────────────────────────────────┘
                                                               630px
```

---

## 3. Next.js Metadata Configuration

```typescript
// app/c/[channelSlug]/page.tsx
export async function generateMetadata({ params }: Props) {
  const channel = await getChannel(params.channelSlug)
  const ogUrl = `${BASE_URL}/api/og/channel?slug=${params.channelSlug}`

  return {
    title: `${channel.name} — Terminal AI`,
    description: channel.description,
    openGraph: {
      title: channel.name,
      description: channel.description,
      url: `${BASE_URL}/c/${params.channelSlug}`,
      siteName: 'Terminal AI',
      images: [{ url: ogUrl, width: 1200, height: 630, alt: channel.name }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: channel.name,
      description: channel.description,
      images: [ogUrl],
    },
  }
}

// app/c/[channelSlug]/[appSlug]/page.tsx — same pattern for app pages
```

---

## 4. Share Button UX

### Placement
```
1. Channel detail page — below header, always visible
2. App detail page — below header, always visible
3. Platform chrome (while using an app) — in [⋮ More] menu
```

### Share Dropdown
```
[Share ↗] clicked →

┌─────────────────────────┐
│  Share this app         │
│  ─────────────────────  │
│  📋 Copy link           │
│  𝕏  Share on X          │
│  💼 Share on LinkedIn   │
│  💬 Share on WhatsApp   │
└─────────────────────────┘

Copy link: copies URL → "Link copied!" toast (2s)

X (Twitter):
  URL: https://twitter.com/intent/tweet
  Params: url={page_url}&text={App Name} on Terminal AI — {short_description}

LinkedIn:
  URL: https://www.linkedin.com/sharing/share-offsite/
  Params: url={page_url}

WhatsApp:
  URL: https://wa.me/
  Params: text={App Name} on Terminal AI: {page_url}
```

---

## 5. OG Route Implementation

```typescript
// app/api/og/app/route.tsx
import { ImageResponse } from 'next/og'
import { getApp } from '@/lib/db'
import { redis } from '@/lib/redis'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  const channelSlug = searchParams.get('channel')

  // Cache check
  const cacheKey = `og:app:${channelSlug}:${slug}`
  const cached = await redis.getBuffer(cacheKey)
  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  }

  const app = await getApp(slug, channelSlug)
  if (!app) return new Response('Not found', { status: 404 })

  const image = new ImageResponse(
    <AppOGImage app={app} />,  // JSX component
    { width: 1200, height: 630 }
  )

  // Cache in Redis (convert stream to buffer)
  const buffer = Buffer.from(await image.arrayBuffer())
  await redis.set(cacheKey, buffer, 'EX', 3600)

  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
```

---

## 6. Cache Invalidation

```
Triggered by: any mutation to channel or app data

Platform BFF mutation handlers (createApp, updateApp, updateChannel, etc.):
  After successful DB write:
    await redis.del(`og:channel:${channelSlug}`)
    await redis.del(`og:app:${channelSlug}:${appSlug}`)

Cloudflare CDN cache:
  Cache-Control max-age=3600 means CDN serves cached for up to 1hr
  For immediate invalidation after important changes (e.g., channel suspension):
    Cloudflare Cache Purge API: POST /zones/{zoneId}/purge_cache { files: [url] }
    Called by platform BFF on admin-triggered changes
```

---

## 7. Font Loading for OG Images

Satori requires fonts to be passed as ArrayBuffer — cannot load from CDN at render time.

```typescript
// Fonts pre-loaded at service startup, cached in memory
const geistSansRegular = await fetch(
  `${MINIO_PUBLIC_URL}/assets/fonts/GeistSans-Regular.otf`
).then(r => r.arrayBuffer())

const geistSansBold = await fetch(
  `${MINIO_PUBLIC_URL}/assets/fonts/GeistSans-Bold.otf`
).then(r => r.arrayBuffer())

// Stored in module-level cache (loaded once, reused for all OG renders)
// Both fonts stored in MinIO /assets/fonts/ bucket (public read)
```
