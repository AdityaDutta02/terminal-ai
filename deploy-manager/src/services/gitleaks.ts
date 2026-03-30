import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface ScanResult {
  clean: boolean
  findings: string[]
}

export async function scanForSecrets(repoPath: string): Promise<ScanResult> {
  try {
    await execFileAsync('gitleaks', [
      'detect',
      '--source', repoPath,
      '--no-git',
      '--exit-code', '1',
    ])
    return { clean: true, findings: [] }
  } catch (err: unknown) {
    const error = err as { code?: number; stdout?: string; stderr?: string }
    if (error.code === 1) {
      const lines = (error.stdout ?? '').split('\n').filter(Boolean)
      return { clean: false, findings: lines }
    }
    throw new Error(`Gitleaks scan failed: ${error.stderr ?? String(err)}`)
  }
}
