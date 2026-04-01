import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AccountPasswordForm } from '../account-password-form'
import { Shield, Smartphone, Monitor, Globe } from 'lucide-react'

export default async function AccountSecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/account/security')

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div>
        <h1 className="text-[28px] font-extrabold text-slate-900">Security</h1>
        <p className="mt-1 text-[15px] text-slate-500">
          Manage your password, sessions, and account security.
        </p>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <Shield className="w-5 h-5 text-slate-600" />
          <h2 className="text-[16px] font-bold text-slate-900">Change Password</h2>
        </div>
        <AccountPasswordForm />
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-slate-600" />
            <div>
              <h2 className="text-[16px] font-bold text-slate-900">
                Two-Factor Authentication
              </h2>
              <p className="text-[13px] text-slate-500 mt-0.5">
                Add an extra layer of security to your account.
              </p>
            </div>
          </div>
          {/* Visual-only toggle */}
          <div className="w-11 h-6 bg-slate-200 rounded-full relative cursor-not-allowed">
            <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform" />
          </div>
        </div>
        <p className="text-[12px] text-slate-400 mt-3">Coming soon.</p>
      </div>

      {/* Active Sessions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <Monitor className="w-5 h-5 text-slate-600" />
          <h2 className="text-[16px] font-bold text-slate-900">Active Sessions</h2>
        </div>
        <div className="space-y-0 divide-y divide-slate-100">
          <SessionRow
            browser="Chrome on macOS"
            time="Active now"
            isCurrent
          />
          <SessionRow
            browser="Safari on iPhone"
            time="2 hours ago"
            isCurrent={false}
          />
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <Globe className="w-5 h-5 text-slate-600" />
          <h2 className="text-[16px] font-bold text-slate-900">Connected Accounts</h2>
        </div>
        <div className="space-y-0 divide-y divide-slate-100">
          <ConnectedAccountRow provider="Google" connected={false} />
          <ConnectedAccountRow provider="GitHub" connected />
        </div>
      </div>
    </div>
  )
}

function SessionRow({
  browser,
  time,
  isCurrent,
}: {
  browser: string
  time: string
  isCurrent: boolean
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-[14px] font-medium text-slate-800">{browser}</p>
        <p className="text-[12px] text-slate-400 mt-0.5">{time}</p>
      </div>
      {isCurrent ? (
        <span className="text-[12px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
          Current
        </span>
      ) : (
        <button className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors">
          Revoke
        </button>
      )}
    </div>
  )
}

function ConnectedAccountRow({
  provider,
  connected,
}: {
  provider: string
  connected: boolean
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
          <span className="text-[12px] font-bold text-slate-500">
            {provider.charAt(0)}
          </span>
        </div>
        <p className="text-[14px] font-medium text-slate-800">{provider}</p>
      </div>
      {connected ? (
        <span className="text-[12px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
          Connected
        </span>
      ) : (
        <button className="text-[12px] font-medium text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors">
          Connect
        </button>
      )}
    </div>
  )
}
