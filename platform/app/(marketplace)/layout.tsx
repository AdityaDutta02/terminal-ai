import { Navbar } from '@/components/navbar'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}
