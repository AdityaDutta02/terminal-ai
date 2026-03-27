'use client'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: { onSuccess: () => router.push('/') },
    })
    router.refresh()
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut}>
      Sign out
    </Button>
  )
}
