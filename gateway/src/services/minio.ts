import { createHash, createHmac, randomUUID } from 'node:crypto'
function minioConfig() {
  const endpoint = process.env.MINIO_ENDPOINT ?? 'http://minio:9000'
  const accessKey = process.env.MINIO_ACCESS_KEY ?? ''
  const secretKey = process.env.MINIO_SECRET_KEY ?? ''
  const bucket = process.env.MINIO_BUCKET ?? 'uploads'
  return { endpoint, accessKey, secretKey, bucket }
}
function sha256hex(data: string | Buffer): string {
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
function buildCanonicalHeaders(reqHeaders: Record<string, string>): string {
  const lines: string[] = []
  for (const key of Object.keys(reqHeaders).sort()) {
    lines.push(`${key}:${reqHeaders[key]}\n`)
  }
  return lines.join('')
}
async function signedPut(url: URL, body: Buffer, contentType: string, cfg: ReturnType<typeof minioConfig>): Promise<Response> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256hex(body)
  const reqHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'content-type': contentType,
  }
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = buildCanonicalHeaders(reqHeaders)
  const canonicalRequest = ['PUT', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return fetch(url.toString(), {
    method: 'PUT',
    headers: { ...reqHeaders, Authorization: authorization },
    body: new Uint8Array(body),
  })
}
export async function uploadFile(params: {
  appId: string
  userId: string
  filename: string
  buffer: Buffer
  contentType: string
}): Promise<string> {
  const cfg = minioConfig()
  const sessionHash = createHash('sha256')
    .update(params.userId + params.appId + new Date().toDateString())
    .digest('hex')
    .slice(0, 16)
  const key = `uploads/${params.appId}/${sessionHash}/${randomUUID()}/${params.filename}`
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key}`)
  const res = await signedPut(url, params.buffer, params.contentType, cfg)
  if (!res.ok) throw new Error(`MinIO PUT failed: ${res.status} ${await res.text()}`)
  return key
}
export function getPublicUrl(key: string): string {
  const { endpoint, bucket } = minioConfig()
  return `${endpoint}/${bucket}/${key}`
}
