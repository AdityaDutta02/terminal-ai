import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [{ hostname: '*.terminalai.studioionique.com' }],
  },
}

export default nextConfig
