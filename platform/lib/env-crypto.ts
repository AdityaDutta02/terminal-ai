import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // bytes — 96-bit IV is standard for GCM
const AUTH_TAG_LENGTH = 16 // bytes

function getKey(): Buffer {
  const secret = process.env.APP_ENV_SECRET
  if (!secret) {
    throw new Error(
      'APP_ENV_SECRET environment variable is not set. ' +
        'Generate a 64-character hex string (32 bytes) and set it.',
    )
  }
  if (secret.length !== 64) {
    throw new Error(
      `APP_ENV_SECRET must be a 64-character hex string (32 bytes). Got ${secret.length} characters.`,
    )
  }
  return Buffer.from(secret, 'hex')
}

export interface EncryptedEnvVar {
  encrypted: string
  iv: string
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * The auth tag is appended to the ciphertext before base64 encoding.
 * Returns encrypted (base64) and iv (hex).
 */
export function encryptValue(plaintext: string): EncryptedEnvVar {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Store authTag appended to ciphertext so decryptValue can extract it
  const combined = Buffer.concat([ciphertext, authTag])

  return {
    encrypted: combined.toString('base64'),
    iv: iv.toString('hex'),
  }
}

/**
 * Decrypts a value produced by encryptValue.
 * Expects encrypted as base64 (ciphertext + 16-byte auth tag) and iv as hex.
 */
export function decryptValue(encrypted: string, iv: string): string {
  const key = getKey()
  const combined = Buffer.from(encrypted, 'base64')
  const ivBuf = Buffer.from(iv, 'hex')

  if (combined.length < AUTH_TAG_LENGTH) {
    throw new Error('Encrypted value is too short — data may be corrupt.')
  }

  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, ivBuf, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
