import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const secret = process.env.APP_ENV_SECRET
  if (!secret || secret.length !== 64) {
    throw new Error('APP_ENV_SECRET must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(secret, 'hex')
}

export function encryptValue(plaintext: string): { encrypted: string; iv: string } {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('hex'),
  }
}

export function decryptValue(encrypted: string, iv: string): string {
  const key = getKey()
  const ivBuf = Buffer.from(iv, 'hex')
  const data = Buffer.from(encrypted, 'base64')
  const authTag = data.subarray(data.length - 16)
  const ciphertext = data.subarray(0, data.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, ivBuf)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
