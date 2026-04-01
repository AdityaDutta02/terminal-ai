'use client'

import type { LucideIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'

type SidebarTab = {
  id: string
  label: string
  icon: LucideIcon
  href: string
}

export function SidebarNav({ title, tabs }: { title: string; tabs: SidebarTab[] }) {
  const pathname = usePathname()

  return (
    <div className="w-[220px] flex-shrink-0">
      <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-3">
        {title}
      </h2>
      <div className="space-y-0.5">
        {tabs.map((t) => {
          const TabIcon = t.icon
          const isActive = pathname === t.href
          return (
            <a
              key={t.id}
              href={t.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-orange-50 text-orange-700 border-l-2 border-orange-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <TabIcon
                className={`w-4 h-4 ${isActive ? 'text-orange-600' : 'text-slate-400'}`}
              />
              {t.label}
            </a>
          )
        })}
      </div>
    </div>
  )
}
