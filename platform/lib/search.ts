const MEILI_URL = process.env.MEILISEARCH_URL ?? 'http://localhost:7700'
const MEILI_KEY = process.env.MEILI_MASTER_KEY ?? ''
const INDEX = 'apps'

export interface AppDocument {
  id: string
  name: string
  description: string
  channelName: string
  channelSlug: string
  appSlug: string
  thumbnailUrl: string | null
  creditsPerSession: number
}

function meiliHeaders(): HeadersInit {
  return { Authorization: `Bearer ${MEILI_KEY}`, 'Content-Type': 'application/json' }
}

export async function indexApps(docs: AppDocument[]): Promise<void> {
  const res = await fetch(`${MEILI_URL}/indexes/${INDEX}/documents`, {
    method: 'POST',
    headers: meiliHeaders(),
    body: JSON.stringify(docs),
  })
  if (!res.ok) throw new Error(`Meilisearch index error: ${await res.text()}`)
}

export interface SearchResult {
  hits: AppDocument[]
  estimatedTotalHits: number
  query: string
}

export async function searchApps(query: string, limit = 20): Promise<SearchResult> {
  const searchBody: Record<string, unknown> = { q: query, limit }
  searchBody.attributesToHighlight = ['name', 'description']
  const res = await fetch(`${MEILI_URL}/indexes/${INDEX}/search`, {
    method: 'POST',
    headers: meiliHeaders(),
    body: JSON.stringify(searchBody),
  })
  if (!res.ok) throw new Error(`Meilisearch search error: ${await res.text()}`)
  return res.json() as Promise<SearchResult>
}

export async function ensureIndex(): Promise<void> {
  const res = await fetch(`${MEILI_URL}/indexes/${INDEX}`, { headers: meiliHeaders() })
  if (res.status === 404) {
    await fetch(`${MEILI_URL}/indexes`, {
      method: 'POST',
      headers: meiliHeaders(),
      body: JSON.stringify({ uid: INDEX, primaryKey: 'id' }),
    })
    await configureIndex()
  }
}

async function configureIndex(): Promise<void> {
  const settings: Record<string, string[]> = {}
  settings.searchableAttributes = ['name', 'description', 'channelName']
  settings.filterableAttributes = ['channelSlug']
  settings.sortableAttributes = ['creditsPerSession']
  const res = await fetch(`${MEILI_URL}/indexes/${INDEX}/settings`, {
    method: 'PATCH',
    headers: meiliHeaders(),
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(`Meilisearch settings error: ${await res.text()}`)
}
