import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { CREDIT_REASON_LABELS } from '@/lib/credit-reasons'
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
  api_usage: { icon: Cpu, bg: 'bg-[#1e1e1f]/[0.04]', color: 'text-[#1e1e1f]/60' },
  api_call: { icon: Cpu, bg: 'bg-[#1e1e1f]/[0.04]', color: 'text-[#1e1e1f]/60' },
  bonus: { icon: Zap, bg: 'bg-emerald-50', color: 'text-emerald-600' },
  welcome: { icon: Zap, bg: 'bg-emerald-50', color: 'text-emerald-600' },
  welcome_bonus: { icon: Zap, bg: 'bg-emerald-50', color: 'text-emerald-600' },
  purchase: { icon: Sparkles, bg: 'bg-orange-50', color: 'text-orange-600' },
  topup: { icon: Sparkles, bg: 'bg-orange-50', color: 'text-orange-600' },
  subscription_credit: { icon: Zap, bg: 'bg-orange-50', color: 'text-orange-600' },
  subscription_grant: { icon: Zap, bg: 'bg-orange-50', color: 'text-orange-600' },
  refund: { icon: Sparkles, bg: 'bg-green-50', color: 'text-green-600' },
  demo: { icon: Zap, bg: 'bg-teal-50', color: 'text-teal-600' },
}

function getReasonIcon(reason: string) {
  return REASON_ICON_MAP[reason] ?? { icon: Sparkles, bg: 'bg-[#1e1e1f]/[0.04]', color: 'text-[#1e1e1f]/50' }
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

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-[28px] font-extrabold text-[#1e1e1f] tracking-tight">Credits</h1>
        <p className="mt-1 text-[15px] text-[#1e1e1f]/50">
          Manage your credit balance and view transaction history.
        </p>
      </div>

      {/* Dark balance card */}
      <div className="bg-gradient-to-br from-[#0A0A0A] to-[#1A1A1A] rounded-2xl p-8">
        <p className="text-orange-300/70 text-[12px] font-semibold uppercase tracking-widest mb-2">
          Available Balance
        </p>
        <p className="text-[52px] font-extrabold text-white font-mono leading-none tabular-nums">
          {balance.toLocaleString()}
        </p>
        <p className="text-white/60 text-[13px] mt-2">tokens</p>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-[#1e1e1f]/[0.08] overflow-hidden">
        <div className="px-6 py-5 border-b border-[#1e1e1f]/[0.05]">
          <h2 className="text-[16px] font-bold text-[#1e1e1f]">Transaction History</h2>
        </div>
        {ledger.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Clock className="w-8 h-8 text-[#1e1e1f]/20 mx-auto mb-3" />
            <p className="text-[14px] text-[#1e1e1f]/35">No transactions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e1e1f]/[0.05]">
            {ledger.map((row) => {
              const { icon: ReasonIcon, bg, color } = getReasonIcon(row.reason)
              return (
                <div key={row.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                      <ReasonIcon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-[#1e1e1f]">
                        {CREDIT_REASON_LABELS[row.reason] ?? row.reason}
                      </p>
                      <p className="text-[12px] text-[#1e1e1f]/35 mt-0.5">
                        {new Date(row.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[14px] font-semibold font-mono ${row.delta > 0 ? 'text-emerald-600' : 'text-[#1e1e1f]'}`}>
                      {row.delta > 0 ? '+' : ''}{row.delta.toLocaleString()}
                    </span>
                    <p className="text-[12px] text-[#1e1e1f]/35">{row.balance_after.toLocaleString()} after</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Get More Credits — simple link to top-up page */}
      <div className="flex items-center justify-between rounded-2xl border border-[#1e1e1f]/[0.08] bg-[#1e1e1f]/[0.02] px-6 py-4">
        <div>
          <p className="text-[14px] font-semibold text-[#1e1e1f]">Need more tokens?</p>
          <p className="text-[13px] text-[#1e1e1f]/40 mt-0.5">Purchase a token pack or upgrade your plan.</p>
        </div>
        <a
          href="/top-up"
          className="flex-shrink-0 rounded-full bg-[#1e1e1f] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#1e1e1f]/80 transition-colors"
        >
          Get tokens
        </a>
      </div>
    </div>
  )
}
