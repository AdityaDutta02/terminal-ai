import { cache } from 'react'

interface Fonts {
  regular: ArrayBuffer
  bold: ArrayBuffer
}

// jsDelivr CDN — Geist Sans TTF (Satori requires TTF/OTF, not WOFF2)
const CDN_REGULAR = 'https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/Geist-Regular.ttf'
const CDN_BOLD = 'https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/Geist-Bold.ttf'

let fontsCache: Fonts | null = null

export const loadFonts = cache(async (): Promise<Fonts> => {
  if (fontsCache) return fontsCache

  // Try MinIO first if configured, fall back to CDN
  const minioBase = process.env.MINIO_PUBLIC_URL ?? process.env.MINIO_ENDPOINT
  const [regularUrl, boldUrl] = minioBase
    ? [
        `${minioBase}/terminalai/assets/fonts/GeistSans-Regular.otf`,
        `${minioBase}/terminalai/assets/fonts/GeistSans-Bold.otf`,
      ]
    : [CDN_REGULAR, CDN_BOLD]

  const fetchFont = (url: string) =>
    fetch(url).then(r => {
      if (!r.ok) throw new Error(`Font fetch failed ${r.status}: ${url}`)
      return r.arrayBuffer()
    })

  try {
    const [regular, bold] = await Promise.all([fetchFont(regularUrl), fetchFont(boldUrl)])
    fontsCache = { regular, bold }
    return fontsCache
  } catch {
    // MinIO failed — retry from CDN
    const [regular, bold] = await Promise.all([fetchFont(CDN_REGULAR), fetchFont(CDN_BOLD)])
    fontsCache = { regular, bold }
    return fontsCache
  }
})

export const OG_DIMENSIONS = { width: 1200, height: 630 }

export const COLORS = {
  bg: '#09090b',
  primaryText: '#ffffff',
  secondaryText: '#a1a1aa',
  accent: '#7c3aed',
  border: '#27272a',
}
