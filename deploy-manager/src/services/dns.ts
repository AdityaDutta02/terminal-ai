function dnsConfig() {
  const token = process.env.CLOUDFLARE_TOKEN
  const zoneId = process.env.CLOUDFLARE_ZONE_ID
  const vpsIp = process.env.VPS2_IP
  if (!token || !zoneId || !vpsIp) throw new Error('Cloudflare env vars must be set')
  return { token, zoneId, vpsIp }
}
function cfUrl(zoneId: string, suffix = ''): string {
  return `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records${suffix}`
}
export async function createSubdomain(subdomain: string): Promise<string> {
  const { token, zoneId, vpsIp } = dnsConfig()
  const record = { type: 'A', name: `${subdomain}.apps.terminalai.studioionique.com`, content: vpsIp, ttl: 60, proxied: true }
  const res = await fetch(cfUrl(zoneId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  })
  if (!res.ok) throw new Error(`DNS create failed: ${res.status}`)
  const data = await res.json() as { result: { id: string } }
  return data.result.id
}
export async function deleteSubdomain(recordId: string): Promise<void> {
  const { token, zoneId } = dnsConfig()
  await fetch(cfUrl(zoneId, `/${recordId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}
