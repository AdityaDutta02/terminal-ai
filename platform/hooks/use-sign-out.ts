'use client'

import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'

export function useSignOut() {
  const router = useRouter()

  return async function signOut() {
    await authClient.signOut({
      fetchOptions: { onSuccess: () => router.push('/') },
    })
    router.refresh()
  }
}
