export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureIndex } = await import('./lib/search')
    try {
      await ensureIndex()
    } catch (err) {
      // Log but do not crash — Meilisearch may not be ready yet.
      // Search will return errors until the index is created.
      // Using console.error because the structured logger may not be initialized yet.
      console.error('[instrumentation] ensureIndex failed:', err)
    }
  }
}
