// platform/app/admin/model-routes/model-routes-table.tsx
'use client'
import { useState } from 'react'

type ModelRoute = {
  id: string
  category: string
  tier: string
  model_string: string
  priority: number
  is_active: boolean
  updated_at: string
}

export function ModelRoutesTable({ initialRoutes }: { initialRoutes: Array<Record<string, unknown>> }) {
  const [routes, setRoutes] = useState<ModelRoute[]>(initialRoutes as unknown as ModelRoute[])

  async function toggleActive(routeId: string, currentValue: boolean) {
    await fetch(`/api/admin/model-routes/${routeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentValue }),
    })
    setRoutes((prev) =>
      prev.map((r) => r.id === routeId ? { ...r, is_active: !currentValue } : r)
    )
  }

  const categories = [...new Set(routes.map((r) => r.category))]

  return (
    <div className="space-y-8">
      {categories.map((cat) => (
        <div key={cat}>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {cat}
          </h2>
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tier</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Model</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Priority</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Active</th>
                </tr>
              </thead>
              <tbody>
                {routes
                  .filter((r) => r.category === cat)
                  .map((route) => (
                    <tr key={route.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{route.tier}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {route.model_string}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{route.priority}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => void toggleActive(route.id, route.is_active)}
                          className={`text-xs font-medium ${
                            route.is_active
                              ? 'text-green-500 hover:text-green-600'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {route.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
