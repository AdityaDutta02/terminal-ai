export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureIndex } = await import('./lib/search')
    await ensureIndex()
  }
}
