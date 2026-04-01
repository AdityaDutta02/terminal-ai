'use client'

import { useState } from 'react'
import { Box, Users, ArrowRight } from 'lucide-react'

export type ChannelCardData = {
  id: string
  slug: string
  name: string
  handle: string
  description: string
  appCount: number
  sessionCount: number
  avatarColor: string
  letter: string
}

export function ChannelCard({ channel, href }: { channel: ChannelCardData; href: string }) {
  const [hovered, setHovered] = useState(false)

  return (
    <a
      href={href}
      className={`bg-white rounded-2xl border p-5 transition-all duration-200 cursor-pointer block ${
        hovered
          ? 'border-orange-200 shadow-lg shadow-orange-100/50 -translate-y-0.5'
          : 'border-slate-100 shadow-sm'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-11 h-11 ${channel.avatarColor} rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}
        >
          {channel.letter}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight mb-0.5">
            {channel.name}
          </h3>
          <p className="text-[13px] text-slate-400 mb-2">{channel.handle}</p>
          <p className="text-[13px] text-slate-500 leading-relaxed line-clamp-2 mb-3">
            {channel.description}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[13px] text-slate-500">{channel.appCount} apps</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[13px] text-slate-500">
                {channel.sessionCount.toLocaleString()} sessions
              </span>
            </div>
          </div>
        </div>
        <ArrowRight
          className={`w-4 h-4 mt-1 flex-shrink-0 transition-all duration-200 ${
            hovered ? 'text-orange-500 translate-x-0.5' : 'text-slate-300'
          }`}
        />
      </div>
    </a>
  )
}
