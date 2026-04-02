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

  // Check if user has a credential (password) account or only social
  const accountResult = await db.query<{ [key: string]: unknown; provider_id: string }>(
    `SELECT "providerId" AS provider_id FROM account WHERE "userId" = $1`,
    [session.user.id],
  )
  const hasPasswordAccount = accountResult.rows.some((r) => r.provider_id === 'credential')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-extrabold text-slate-900">Security</h1>
        <p className="mt-1 text-[15px] text-slate-500">
          Manage your password and account.
        </p>
      </div>

      {hasPasswordAccount && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <Shield className="w-5 h-5 text-slate-600" />
            <h2 className="text-[16px] font-bold text-slate-900">Change Password</h2>
          </div>
          <AccountPasswordForm />
        </div>
      )}

      {!hasPasswordAccount && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-5 h-5 text-slate-600" />
            <h2 className="text-[16px] font-bold text-slate-900">Authentication</h2>
          </div>
          <p className="text-[14px] text-slate-500">
            You signed in with Google. No password is set for this account.
          </p>
        </div>
      )}

      <DeleteAccountSection />
    </div>
  )
}
