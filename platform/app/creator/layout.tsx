import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/navbar'

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/creator')
  if (
    (session.user as Record<string, unknown>).role !== 'creator' &&
    (session.user as Record<string, unknown>).role !== 'admin'
  ) {
    redirect('/?error=not_creator')
  }
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}
