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

// --- Per-app storage functions ---

function appStorageKey(appId: string, key: string): string {
  return `apps/${appId}/${key}`
}

/** Upload a file to the app's storage prefix */
export async function storageUpload(params: {
  appId: string
  key: string
  buffer: Buffer
  contentType: string
}): Promise<void> {
  const cfg = minioConfig()
  const fullKey = appStorageKey(params.appId, params.key)
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${fullKey}`)
  const res = await signedPut(url, params.buffer, params.contentType, cfg)
  if (!res.ok) throw new Error(`MinIO PUT failed: ${res.status} ${await res.text()}`)
}

/** Download a file from the app's storage prefix */
export async function storageGet(appId: string, key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const cfg = minioConfig()
  const fullKey = appStorageKey(appId, key)
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${fullKey}`)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  const reqHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = buildCanonicalHeaders(reqHeaders)
  const canonicalRequest = ['GET', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url.toString(), { method: 'GET', headers: { ...reqHeaders, Authorization: authorization } })
  if (res.status === 404) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })
  if (!res.ok) throw new Error(`MinIO GET failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  return { buffer, contentType }
}

/** List files in the app's storage prefix */
export async function storageList(appId: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
  const cfg = minioConfig()
  const prefix = `apps/${appId}/`
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}`)
  url.searchParams.set('list-type', '2')
  url.searchParams.set('prefix', prefix)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  const reqHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = buildCanonicalHeaders(reqHeaders)
  const sortedQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const canonicalRequest = ['GET', url.pathname, sortedQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url.toString(), { method: 'GET', headers: { ...reqHeaders, Authorization: authorization } })
  if (!res.ok) throw new Error(`MinIO list failed: ${res.status}`)
  const xml = await res.text()

  const contentBlocks = xml.match(/<Contents>([\s\S]*?)<\/Contents>/g) ?? []
  return contentBlocks.map((block) => {
    const fullKey = block.match(/<Key>(.*?)<\/Key>/)?.[1] ?? ''
    const size = parseInt(block.match(/<Size>(.*?)<\/Size>/)?.[1] ?? '0', 10)
    const lastModified = block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] ?? ''
    return { key: fullKey.slice(prefix.length), size, lastModified }
  }).filter((f) => f.key.length > 0)
}

/** Delete a single file from the app's storage prefix */
export async function storageDelete(appId: string, key: string): Promise<void> {
  const cfg = minioConfig()
  const fullKey = appStorageKey(appId, key)
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${fullKey}`)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  const reqHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = buildCanonicalHeaders(reqHeaders)
  const canonicalRequest = ['DELETE', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url.toString(), { method: 'DELETE', headers: { ...reqHeaders, Authorization: authorization } })
  if (res.status === 404) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })
  if (!res.ok) throw new Error(`MinIO DELETE failed: ${res.status}`)
}

/** Delete all files under the app's storage prefix (used during app deletion) */
export async function storageDeletePrefix(appId: string): Promise<void> {
  const files = await storageList(appId)
  for (const file of files) {
    await storageDelete(appId, file.key)
  }
}
