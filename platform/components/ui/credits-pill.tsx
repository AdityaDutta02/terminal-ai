import { Coins } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreditsPillProps {
  credits: number
  className?: string
}

export function CreditsPill({ credits, className }: CreditsPillProps) {
  const isLow = credits < 30
  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
      isLow
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-gray-200 bg-gray-50 text-gray-700',
      className,
    )}>
      <Coins className={cn('h-3.5 w-3.5', isLow ? 'text-amber-500' : 'text-violet-500')} />
      <span className="font-mono">{credits.toLocaleString()}</span>
    </div>
  )
}
