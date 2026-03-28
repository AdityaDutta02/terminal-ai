import { describe, it, expect } from 'vitest'
import { scanForSecrets } from './gitleaks'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

describe('gitleaks secret scan', () => {
  it('detects hardcoded API key', async () => {
    const dir = '/tmp/gitleaks-test-dirty'
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.ts'), `const key = "sk-ant-abcdefghijklmnop1234567890"`)
    const result = await scanForSecrets(dir)
    expect(result.clean).toBe(false)
    rmSync(dir, { recursive: true })
  }, 30_000)

  it('passes clean repo', async () => {
    const dir = '/tmp/gitleaks-test-clean'
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.ts'), `const x = process.env.API_KEY`)
    const result = await scanForSecrets(dir)
    expect(result.clean).toBe(true)
    rmSync(dir, { recursive: true })
  }, 30_000)
})
