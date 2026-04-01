'use client'
import { useState, useCallback, useRef } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import type { AppDocument } from '@/lib/search'
interface SearchBarProps {
  placeholder?: string
}
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}
export function SearchBar({ placeholder = 'Search apps…' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AppDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`)
      const data = await res.json() as { hits: AppDocument[] }
      setResults(data.hits ?? [])
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(debounce(doSearch, 250), [doSearch])
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    debouncedSearch(q)
  }
  function clear() {
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }
  return (
    <div className="relative w-full max-w-xl">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={handleChange}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm outline-none focus:border-[#FF6B00]/30 focus:ring-2 focus:ring-[#FF6B00]/10"
        />
        {loading && <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-gray-400" />}
        {!loading && query && (
          <button onClick={clear} className="absolute right-3 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {results.map((hit) => (
            <a
              key={hit.id}
              href={`/c/${hit.channelSlug}/${hit.appSlug}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-orange-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{hit.name}</p>
                <p className="truncate text-xs text-gray-400">{hit.channelName}</p>
              </div>
              <span className="ml-auto shrink-0 text-xs text-gray-400">{hit.creditsPerSession} cr</span>
            </a>
          ))}
        </div>
      )}
      {open && results.length === 0 && !loading && query && (
        <div className="absolute top-full z-50 mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
          <p className="text-sm text-gray-400">No results for &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  )
}
