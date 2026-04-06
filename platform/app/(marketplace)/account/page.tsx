import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { CREDIT_REASON_LABELS } from '@/lib/credit-reasons'
import { Play, Sparkles, Cpu, Zap, Clock, CalendarDays, RefreshCcw, type LucideIcon } from 'lucide-react'

type IconStyle = { icon: LucideIcon; bg: string; color: string }

type SubscriptionRow = {
  plan_id: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  name: string
  price_inr: number
}

type LedgerRow = {
  id: string
  delta: number
  balance_after: number
  reason: string
  created_at: string
}

function getReasonIcon(reason: string): IconStyle {
  if (reason === 'session_start') return { icon: Play, bg: 'bg-blue-50', color: 'text-blue-600' }
  if (reason === 'admin_grant') return { icon: Sparkles, bg: 'bg-amber-50', color: 'text-amber-600' }
  if (reason === 'refund') return { icon: Sparkles, bg: 'bg-green-50', color: 'text-green-600' }
  if (reason === 'demo') return { icon: Zap, bg: 'bg-teal-50', color: 'text-teal-600' }
  if (reason.startsWith('api_')) return { icon: Cpu, bg: 'bg-[#1e1e1f]/[0.04]', color: 'text-[#1e1e1f]/60' }
  if (reason.startsWith('welcome')) return { icon: Zap, bg: 'bg-emerald-50', color: 'text-emerald-600' }
  if (reason.startsWith('subscription_')) return { icon: Zap, bg: 'bg-orange-50', color: 'text-orange-600' }
  if (reason.startsWith('credit_pack_') || reason === 'topup') return { icon: Sparkles, bg: 'bg-orange-50', color: 'text-orange-600' }
  return { icon: Sparkles, bg: 'bg-[#1e1e1f]/[0.04]', color: 'text-[#1e1e1f]/50' }
}

async function getSubscription(userId: string): Promise<SubscriptionRow | null> {
  const res = await db.query<SubscriptionRow>(
    `SELECT us.plan_id, us.status, us.current_period_start, us.current_period_end,
            p.name, p.price_inr
     FROM subscriptions.user_subscriptions us
     JOIN subscriptions.plans p ON p.id = us.plan_id
     WHERE us.user_id = $1 AND us.status IN ('active', 'paused')
     ORDER BY us.created_at DESC LIMIT 1`,
    [userId],
  ).catch(() => null)
  return res?.rows[0] ?? null
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

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AccountCreditsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/account')

  const [{ balance, ledger }, sub] = await Promise.all([
    getAccountData(session.user.id),
    getSubscription(session.user.id),
  ])

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-[28px] font-extrabold text-[#1e1e1f] tracking-tight">Credits</h1>
        <p className="mt-1 text-[15px] text-[#1e1e1f]/50">
          Manage your credit balance and view transaction history.
        </p>
      </div>

      {/* Active subscription card */}
      {sub && (
        <div className="bg-white rounded-2xl border border-[#1e1e1f]/[0.08] p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#FF6B00] mb-1">Active Plan</p>
              <p className="text-[18px] font-bold text-[#1e1e1f]">{sub.name} Subscription</p>
            </div>
            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${
              sub.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#f5f5f0] flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-[#1e1e1f]/50" />
              </div>
              <div>
                <p className="text-[11px] text-[#1e1e1f]/40">Started</p>
                <p className="text-[13px] font-medium text-[#1e1e1f]">{fmtDate(sub.current_period_start)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#f5f5f0] flex items-center justify-center">
                <RefreshCcw className="w-4 h-4 text-[#1e1e1f]/50" />
              </div>
              <div>
                <p className="text-[11px] text-[#1e1e1f]/40">Renews</p>
                <p className="text-[13px] font-medium text-[#1e1e1f]">{fmtDate(sub.current_period_end)}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-[#1e1e1f]/[0.05] flex items-center justify-between">
            <p className="text-[12px] text-[#1e1e1f]/40">650 credits per period</p>
            <a href={`/pricing?plan=${sub.plan_id}`} className="text-[12px] font-medium text-[#FF6B00] hover:underline">Manage plan</a>
          </div>
        </div>
      )}

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
