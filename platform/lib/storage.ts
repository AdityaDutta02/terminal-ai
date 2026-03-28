import { createHmac, createHash } from 'crypto'
const ENDPOINT = process.env.MINIO_ENDPOINT ?? 'http://localhost:9000'
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? ''
const SECRET_KEY = process.env.MINIO_SECRET_KEY ?? ''
const BUCKET = process.env.MINIO_BUCKET ?? 'terminalai'
const REGION = 'us-east-1'
function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}
function sha256hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}
function getSigningKey(dateStamp: string): Buffer {
  const kDate = hmacSha256('AWS4' + SECRET_KEY, dateStamp)
  const kRegion = hmacSha256(kDate, REGION)
  const kService = hmacSha256(kRegion, 's3')
  return hmacSha256(kService, 'aws4_request')
}
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const url = new URL(`${ENDPOINT}/${BUCKET}/${key}`)
  const payloadHash = sha256hex(body)
  const headers: Record<string, string> = {}
  headers['host'] = url.host
  headers['x-amz-date'] = amzDate
  headers['x-amz-content-sha256'] = payloadHash
  headers['content-type'] = contentType
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}\n`)
    .join('')
  const canonicalRequest = [
    'PUT', url.pathname, '',
    canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n')
  const credentialScope = `${dateStamp}/${REGION}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest),
  ].join('\n')
  const signature = hmacSha256(getSigningKey(dateStamp), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: { ...headers, Authorization: authorization },
    body: new Uint8Array(body),
  })
  if (!res.ok) throw new Error(`MinIO PUT failed: ${res.status} ${await res.text()}`)
  return key
}
export function getPublicUrl(key: string): string {
  return `${ENDPOINT}/${BUCKET}/${key}`
}
