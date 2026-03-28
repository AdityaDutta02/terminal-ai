import { cache } from 'react'

interface Fonts {
  regular: ArrayBuffer
  bold: ArrayBuffer
}

let fontsCache: Fonts | null = null

export const loadFonts = cache(async (): Promise<Fonts | null> => {
  if (fontsCache) return fontsCache
  const baseUrl = process.env.MINIO_PUBLIC_URL ?? process.env.MINIO_ENDPOINT
  if (!baseUrl) return null
  try {
    const [regular, bold] = await Promise.all([
      fetch(`${baseUrl}/terminalai/assets/fonts/GeistSans-Regular.otf`).then(r => {
        if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`)
        return r.arrayBuffer()
      }),
      fetch(`${baseUrl}/terminalai/assets/fonts/GeistSans-Bold.otf`).then(r => {
        if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`)
        return r.arrayBuffer()
      }),
    ])
    fontsCache = { regular, bold }
    return fontsCache
  } catch {
    return null
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
