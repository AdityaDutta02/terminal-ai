import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { ApiKeyManager } from './components/ApiKeyManager'
import { McpConnectionGuide } from './components/McpConnectionGuide'
import { ApiReferenceSection } from './components/ApiReferenceSection'

export const metadata = {
  title: 'Developer API — Terminal AI',
  description: 'Connect your AI coding assistant to Terminal AI with MCP.',
}

interface PageSectionProps {
  title: string
  description: string
  children: React.ReactNode
}

function PageSection(props: PageSectionProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{props.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{props.description}</p>
      </div>
      {props.children}
    </section>
  )
}

const MCP_SERVER_ITEMS = [
  { label: 'Transport', value: 'SSE (Server-Sent Events)' },
  { label: 'Endpoint', value: 'http://178.104.124.224/mcp' },
  { label: 'Auth', value: 'Bearer <your-api-key>' },
  {
    label: 'Available Tools',
    value: 'scaffold_app · create_channel · deploy_app · get_deployment_status · list_supported_providers',
  },
]

export default async function DevelopersPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-16">

      <div className="space-y-3">
        <div className="inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
          Developer API
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Build apps with your AI editor</h1>
        <p className="text-base text-gray-600 max-w-xl">
          Connect Claude, Cursor, or any MCP-compatible editor to Terminal AI. Scaffold, publish, and deploy apps to your channel — all from a single prompt.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-gray-50 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">MCP Server</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {MCP_SERVER_ITEMS.map(item => (
            <div key={item.label} className="rounded-lg bg-white border border-gray-200 p-3">
              <p className="text-xs text-gray-400 mb-1">{item.label}</p>
              <code className="text-gray-900 text-xs">{item.value}</code>
            </div>
          ))}
        </div>
      </section>

      <PageSection
        title="API Keys"
        description="Generate keys to authenticate your MCP client. Each key is hashed and cannot be recovered after creation."
      >
        <ApiKeyManager />
      </PageSection>

      <PageSection
        title="Getting Started"
        description="Follow these steps to connect your editor and deploy your first app in under 5 minutes."
      >
        <McpConnectionGuide />
      </PageSection>

      <PageSection
        title="API Reference"
        description="REST endpoints available on the platform."
      >
        <ApiReferenceSection />
      </PageSection>

    </div>
  )
}
