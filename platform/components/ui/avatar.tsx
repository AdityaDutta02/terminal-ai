import { cn } from '@/lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  fallback: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

const sizes = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
}

export function Avatar({ src, alt, fallback, size = 'md', className }: AvatarProps) {
  return (
    <div className={cn('relative flex-shrink-0 rounded-full overflow-hidden', sizes[size], className)}>
      {src ? (
        <img src={src} alt={alt ?? fallback} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-orange-100 flex items-center justify-center font-semibold text-orange-700">
          {fallback[0]?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  )
}
