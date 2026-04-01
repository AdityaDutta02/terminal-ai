'use client'

import { useState } from 'react'
import { Star, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type AppCardData = {
  id: string
  name: string
  slug: string
  channelName: string
  channelSlug: string
  description: string
  credits: number
  rating: number
  reviewCount: number
  category: string
  gradient: string
  icon: LucideIcon
}

export function AppCard({ app, href }: { app: AppCardData; href: string }) {
  const [hovered, setHovered] = useState(false)
  const Icon = app.icon

  return (
    <a
      href={href}
      className={`bg-white rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col ${
        hovered
          ? 'border-orange-200 shadow-lg shadow-orange-100/50 -translate-y-0.5'
          : 'border-slate-100 shadow-sm'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`m-3 mb-0 rounded-xl bg-gradient-to-br ${app.gradient} p-6 flex items-center justify-center`}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div className="p-4 pt-3 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
            {app.category}
          </span>
        </div>
        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">{app.name}</h3>
        <p className="text-[13px] text-slate-500 mb-1">{app.channelName}</p>
        <p className="text-[13px] text-slate-500 leading-relaxed mb-3 line-clamp-2 flex-1">
          {app.description}
        </p>
        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
            <span className="text-[13px] font-medium text-slate-700">{app.rating}</span>
            <span className="text-[12px] text-slate-400">({app.reviewCount})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[13px] font-semibold text-slate-700 font-mono">{app.credits}</span>
            <span className="text-[12px] text-slate-400">/session</span>
          </div>
        </div>
      </div>
    </a>
  )
}
