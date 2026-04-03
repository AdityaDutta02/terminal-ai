import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DevelopersLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/developers')
  const role = (session.user as Record<string, unknown>).role as string | undefined
  if (role !== 'admin' && role !== 'creator') {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="rounded-2xl border border-[#1e1e1f]/[0.08] bg-[#1e1e1f]/[0.02] p-12 text-center">
          <p className="text-[15px] font-semibold text-[#1e1e1f]">Creator access required</p>
          <p className="text-[14px] text-[#1e1e1f]/50 mt-2">
            The developer API is currently available to approved creators only.
          </p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
