import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Validates a redirect path is safe (relative, no open redirect).
 * Accepts only paths starting with '/' that are not protocol-relative ('//').
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next) return '/'
  if (next.startsWith('/') && !next.startsWith('//') && !next.includes(':')) return next
  return '/'
}
