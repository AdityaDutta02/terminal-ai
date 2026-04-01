import { SidebarNav } from '@/components/sidebar-nav'

const accountTabs = [
  { id: 'credits', label: 'Credits', icon: 'Sparkles', href: '/account' },
  { id: 'security', label: 'Security', icon: 'Shield', href: '/account/security' },
  { id: 'usage', label: 'Usage History', icon: 'Clock', href: '/account/usage' },
]

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <SidebarNav title="Account" tabs={accountTabs} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
