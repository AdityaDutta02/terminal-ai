import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.app'
export const metadata: Metadata = {
  title: { default: 'Terminal AI', template: '%s — Terminal AI' },
  description: 'AI-powered apps, built by creators.',
  metadataBase: new URL(APP_URL),
  openGraph: {
    siteName: 'Terminal AI',
    images: [{ url: '/og', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
