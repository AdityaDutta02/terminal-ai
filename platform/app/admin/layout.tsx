import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/navbar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/admin')
  const role = ((session.user as Record<string, unknown>).role as string | undefined) ?? 'user'
  if (role !== 'admin') redirect('/?error=forbidden')
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}
