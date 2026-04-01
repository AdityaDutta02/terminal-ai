import { headers } from 'next/headers'
import { ChannelsTable } from './channels-table'

type ChannelRow = {
  id: string
  name: string
  slug: string
  is_superadmin_channel: boolean
  creator_balance: number
  created_at: string
  owner_email: string
  owner_name: string
  apps_count: number
  is_suspended: boolean
}

export default async function AdminChannelsPage() {
  const hdrs = await headers()
  const cookie = hdrs.get('cookie') ?? ''
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels`, {
    headers: { cookie },
    cache: 'no-store',
  })
  const { channels } = (await res.json()) as { channels: ChannelRow[] }

  return (
    <div>
      <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight mb-6">Channels</h1>
      <ChannelsTable channels={channels ?? []} />
    </div>
  )
}
