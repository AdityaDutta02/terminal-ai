interface CompressionResult {
  buffer: Buffer
  contentType: string
  originalSize: number
  compressedSize: number
}
export async function compressFile(
  buffer: Buffer,
  mimeType: string,
  level: 'high_fidelity' | 'balanced' | 'aggressive' = 'balanced'
): Promise<CompressionResult> {
  const originalSize = buffer.length
  if (mimeType.startsWith('image/')) {
    const sharp = (await import('sharp')).default
    const quality = level === 'high_fidelity' ? 95 : level === 'balanced' ? 80 : 60
    const compressed = await sharp(buffer).webp({ quality }).toBuffer()
    return { buffer: compressed, contentType: 'image/webp', originalSize, compressedSize: compressed.length }
  }
  return { buffer, contentType: mimeType, originalSize, compressedSize: buffer.length }
}
