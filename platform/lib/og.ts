import { cache } from 'react'

interface Fonts {
  regular: ArrayBuffer
  bold: ArrayBuffer
}

let fontsCache: Fonts | null = null

export const loadFonts = cache(async (): Promise<Fonts> => {
  if (fontsCache) return fontsCache
  const MINIO_URL = process.env.MINIO_PUBLIC_URL!
  const [regular, bold] = await Promise.all([
    fetch(`${MINIO_URL}/assets/fonts/GeistSans-Regular.otf`).then(r => r.arrayBuffer()),
    fetch(`${MINIO_URL}/assets/fonts/GeistSans-Bold.otf`).then(r => r.arrayBuffer()),
  ])
  fontsCache = { regular, bold }
  return fontsCache
})

export const OG_DIMENSIONS = { width: 1200, height: 630 }

export const COLORS = {
  bg: '#09090b',
  primaryText: '#ffffff',
  secondaryText: '#a1a1aa',
  accent: '#7c3aed',
  border: '#27272a',
}
