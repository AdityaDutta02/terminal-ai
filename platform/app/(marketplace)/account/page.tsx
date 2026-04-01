import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { TopUpButton } from './top-up-button'
import { CREDIT_REASON_LABELS } from '@/lib/credit-reasons'
import { getTopUpPackages } from '@/lib/top-up-packages'
import { Play, Sparkles, Cpu, Zap, Clock } from 'lucide-react'

type LedgerRow = {
  id: string
  delta: number
  balance_after: number
  reason: string
  created_at: string
}

const REASON_ICON_MAP: Record<string, { icon: typeof Sparkles; bg: string; color: string }> = {
  session_start: { icon: Play, bg: 'bg-blue-50', color: 'text-blue-600' },
  admin_grant: { icon: Sparkles, bg: 'bg-amber-50', color: 'text-amber-600' },
  api_usage: { icon: Cpu, bg: 'bg-slate-100', color: 'text-slate-600' },
  api_call: { icon: Cpu, bg: 'bg-slate-100', color: 'text-slate-600' },
  bonus: { icon: Zap, bg: 'bg-emerald-50', color: 'text-emerald-600' },
  welcome: { icon: Zap, bg: 'bg-emerald-50', color: 'text-emerald-600' },
  purchase: { icon: Sparkles, bg: 'bg-orange-50', color: 'text-orange-600' },
  topup: { icon: Sparkles, bg: 'bg-orange-50', color: 'text-orange-600' },
  subscription_credit: { icon: Zap, bg: 'bg-violet-50', color: 'text-violet-600' },
  subscription_grant: { icon: Zap, bg: 'bg-violet-50', color: 'text-violet-600' },
  refund: { icon: Sparkles, bg: 'bg-green-50', color: 'text-green-600' },
  demo: { icon: Zap, bg: 'bg-teal-50', color: 'text-teal-600' },
}

function getReasonIcon(reason: string) {
  return REASON_ICON_MAP[reason] ?? { icon: Sparkles, bg: 'bg-slate-50', color: 'text-slate-500' }
}

async function getAccountData(userId: string) {
  const [balanceRes, ledgerRes] = await Promise.all([
    db.query<{ credits: number }>(
      `SELECT COALESCE(
         (SELECT balance_after FROM subscriptions.credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
         (SELECT credits FROM "user" WHERE id = $1), 0
       ) AS credits`,
      [userId],
    ).catch(() => null),
    db.query<LedgerRow>(
      `SELECT id, delta, balance_after, reason, created_at
       FROM subscriptions.credit_ledger WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [userId],
    ).catch(() => null),
  ])
  return {
    balance: balanceRes?.rows[0]?.credits ?? 0,
    ledger: ledgerRes?.rows ?? [],
  }
}

export default async function AccountCreditsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/account')

  const { balance, ledger } = await getAccountData(session.user.id)
  const rzpKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ''
  const topUpPackages = getTopUpPackages()

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div>
        <h1 className="text-[28px] font-extrabold text-slate-900">Credits</h1>
        <p className="mt-1 text-[15px] text-slate-500">
          Manage your credit balance and purchase more credits.
        </p>
      </div>

      {/* Dark balance card */}
      <div className="bg-gradient-to-br from-[#0A0A0A] to-[#1A1A1A] rounded-2xl p-8">
        <p className="text-orange-200 text-[13px] font-medium uppercase tracking-wider mb-2">
          Available Balance
        </p>
        <p className="text-[48px] font-extrabold text-white font-mono leading-none">
          {balance.toLocaleString()}
        </p>
        <p className="text-slate-400 text-[13px] mt-2">credits</p>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-[16px] font-bold text-slate-900">Recent Transactions</h2>
        </div>
        {ledger.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-[14px] text-slate-400">No transactions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ledger.map((row) => {
              const { icon: ReasonIcon, bg, color } = getReasonIcon(row.reason)
              return (
                <div key={row.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                      <ReasonIcon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-slate-800">
                        {CREDIT_REASON_LABELS[row.reason] ?? row.reason}
                      </p>
                      <p className="text-[12px] text-slate-400 mt-0.5">
                        {new Date(row.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-[14px] font-semibold ${
                        row.delta > 0 ? 'text-emerald-600' : 'text-slate-700'
                      }`}
                    >
                      {row.delta > 0 ? '+' : ''}
                      {row.delta}
                    </span>
                    <p className="text-[12px] text-slate-400">{row.balance_after} after</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Get More Credits */}
      <div>
        <h2 className="text-[18px] font-bold text-slate-900 mb-4">Get More Credits</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {topUpPackages.map((pkg) => (
            <TopUpButton
              key={pkg.planCode}
              credits={pkg.credits}
              price={pkg.price}
              planCode={pkg.planCode}
              popular={pkg.popular}
              razorpayKeyId={rzpKey}
              userEmail={session.user.email ?? ''}
              userName={session.user.name ?? ''}
            />
          ))}
        </div>
        <p className="mt-3 text-[12px] text-slate-400">
          Powered by Razorpay. Secure checkout.
        </p>
      </div>
    </div>
  )
}
