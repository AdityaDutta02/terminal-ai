// deploy-manager/src/services/storage-cleanup.ts
import { createHash, createHmac } from 'crypto'

function minioConfig(): { endpoint: string; accessKey: string; secretKey: string; bucket: string } {
  return {
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://minio:9000',
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
    bucket: process.env.MINIO_BUCKET ?? 'uploads',
  }
}

function sha256hex(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function getSigningKey(secretKey: string, dateStamp: string): Buffer {
  const kDate = hmacSha256('AWS4' + secretKey, dateStamp)
  const kRegion = hmacSha256(kDate, 'us-east-1')
  const kService = hmacSha256(kRegion, 's3')
  return hmacSha256(kService, 'aws4_request')
}

function buildAuth(method: string, pathname: string, queryString: string, cfg: ReturnType<typeof minioConfig>): Record<string, string> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  const host = new URL(cfg.endpoint).host
  const reqHeaders: Record<string, string> = { host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = Object.keys(reqHeaders).sort().map((k) => `${k}:${reqHeaders[k]}\n`).join('')
  const canonicalRequest = [method, pathname, queryString, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  return {
    ...reqHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

async function listPrefix(appId: string): Promise<string[]> {
  const cfg = minioConfig()
  const prefix = `apps/${appId}/`
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}`)
  url.searchParams.set('list-type', '2')
  url.searchParams.set('prefix', prefix)
  const sortedQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const headers = buildAuth('GET', `/${cfg.bucket}`, sortedQuery, cfg)
  const res = await fetch(url.toString(), { method: 'GET', headers })
  if (!res.ok) return []
  const xml = await res.text()
  return (xml.match(/<Key>(.*?)<\/Key>/g) ?? []).map((m) => m.replace(/<\/?Key>/g, ''))
}

async function deleteKey(key: string): Promise<void> {
  const cfg = minioConfig()
  const pathname = `/${cfg.bucket}/${key}`
  const url = new URL(`${cfg.endpoint}${pathname}`)
  const headers = buildAuth('DELETE', pathname, '', cfg)
  await fetch(url.toString(), { method: 'DELETE', headers })
}

export async function storageDeletePrefix(appId: string): Promise<void> {
  const keys = await listPrefix(appId)
  for (const key of keys) await deleteKey(key)
}
