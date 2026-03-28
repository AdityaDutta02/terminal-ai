import { describe, it, expect } from 'vitest'
import { scanBuffer } from './clamav'
const EICAR = Buffer.from(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
)
describe('ClamAV scanner', () => {
  it('detects EICAR test virus', async () => {
    const result = await scanBuffer(EICAR, 'test.txt')
    expect(result.clean).toBe(false)
    expect(result.virusName).toContain('Eicar')
  }, 10_000)
  it('passes clean buffer', async () => {
    const result = await scanBuffer(Buffer.from('hello world'), 'hello.txt')
    expect(result.clean).toBe(true)
  }, 10_000)
})
