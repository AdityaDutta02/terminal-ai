import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { AccountPasswordForm } from '../account-password-form'
import { DeleteAccountSection } from './delete-account'
import { Shield } from 'lucide-react'

export default async function AccountSecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/account/security')

  const accountResult = await db.query<{ [key: string]: unknown; provider_id: string }>(
    `SELECT "providerId" AS provider_id FROM account WHERE "userId" = $1`,
    [session.user.id],
  )
  const hasPasswordAccount = accountResult.rows.some((r) => r.provider_id === 'credential')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold text-[#1e1e1f] tracking-tight">Security</h1>
        <p className="mt-1 text-[15px] text-[#1e1e1f]/50">
          Manage your password and account settings.
        </p>
      </div>

      {hasPasswordAccount && (
        <div className="bg-white rounded-2xl border border-[#1e1e1f]/[0.08] p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-[#1e1e1f]/[0.04] flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#1e1e1f]/50" />
            </div>
            <h2 className="text-[16px] font-bold text-[#1e1e1f]">Change Password</h2>
          </div>
          <AccountPasswordForm />
        </div>
      )}

      {!hasPasswordAccount && (
        <div className="bg-white rounded-2xl border border-[#1e1e1f]/[0.08] p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-[#1e1e1f]/[0.04] flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#1e1e1f]/50" />
            </div>
            <h2 className="text-[16px] font-bold text-[#1e1e1f]">Authentication</h2>
          </div>
          <p className="text-[14px] text-[#1e1e1f]/50">
            You signed in with Google. No password is set for this account.
          </p>
        </div>
      )}

      <DeleteAccountSection />
    </div>
  )
}
