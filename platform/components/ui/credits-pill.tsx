import { Coins } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreditsPillProps {
  credits: number
  className?: string
  variant?: 'light' | 'dark'
}

export function CreditsPill({ credits, className, variant = 'light' }: CreditsPillProps) {
  const isLow = credits < 30

  const containerClass = variant === 'dark'
    ? isLow
      ? 'border-amber-700 bg-amber-900/40 text-amber-400'
      : 'border-zinc-700 bg-zinc-800 text-zinc-300'
    : isLow
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-gray-200 bg-gray-50 text-gray-700'

  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
      containerClass,
      className,
    )}>
      <Coins className={cn('h-3.5 w-3.5', isLow ? 'text-amber-500' : 'text-[#FF6B00]')} />
      <span className="font-mono">{credits.toLocaleString()}</span>
    </div>
  )
}
