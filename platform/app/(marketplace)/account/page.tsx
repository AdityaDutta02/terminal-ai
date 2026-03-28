import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CreditsPill } from '@/components/ui/credits-pill'
import { AccountPasswordForm } from './account-password-form'
import { TopUpButton } from './top-up-button'
import { Coins, Clock, TrendingDown, TrendingUp } from 'lucide-react'
import { CREDIT_REASON_LABELS } from '@/lib/credit-reasons'
import { getTopUpPackages } from '@/lib/top-up-packages'
type LedgerRow = {
  id: string
  delta: number
  balance_after: number
  reason: string
  created_at: string
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
export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/account')
  const { balance, ledger } = await getAccountData(session.user.id)
  const rzpKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ''
  const topUpPackages = getTopUpPackages()
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account</h1>
          <p className="mt-1 text-sm text-gray-500">{session.user.email}</p>
        </div>
        <CreditsPill credits={balance} />
      </div>
      <Tabs defaultValue="credits">
        <TabsList className="mb-6">
          <TabsTrigger value="credits">Credits</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="credits" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="h-4 w-4 text-violet-500" />
                Credit Balance
              </CardTitle>
              <CardDescription>Your current credit balance and recent transactions.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-3">
                <span className="text-3xl font-bold text-gray-900">{balance.toLocaleString()}</span>
                <span className="text-sm text-gray-500">credits remaining</span>
              </div>
              <Separator className="mb-4" />
              {ledger.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No transactions yet.</p>
              ) : (
                <div className="space-y-0 divide-y divide-gray-100">
                  {ledger.map((row) => (
                    <div key={row.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        {row.delta > 0 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-gray-400" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {CREDIT_REASON_LABELS[row.reason] ?? row.reason}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3 w-3" />
                            {new Date(row.created_at).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-semibold ${row.delta > 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                          {row.delta > 0 ? '+' : ''}{row.delta}
                        </span>
                        <p className="text-xs text-gray-400">{row.balance_after} after</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Get More Credits</CardTitle>
              <CardDescription>Top up your balance to keep using apps.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
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
              <p className="mt-3 text-xs text-gray-400">Powered by Razorpay. Secure checkout.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription>Update your account password.</CardDescription>
            </CardHeader>
            <CardContent>
              <AccountPasswordForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
