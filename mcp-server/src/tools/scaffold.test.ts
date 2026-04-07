import { describe, it, expect } from 'vitest'
import { scaffoldApp } from './scaffold'
describe('scaffoldApp', () => {
  it('generates required files for nextjs app', () => {
    const result = scaffoldApp({
      framework: 'nextjs',
      app_name: 'PDF Summariser',
      description: 'Summarises uploaded PDFs',
      category: 'productivity',
      uses_ai: true,
      uses_file_upload: true,
      generates_artifacts: false,
    })
    expect(result.files).toHaveProperty('terminal-ai.config.json')
    expect(result.files).toHaveProperty('app/api/health/route.ts')
    expect(result.files).toHaveProperty('.env.example')
    const config = JSON.parse(result.files['terminal-ai.config.json']) as { framework: string; health_check_path: string }
    expect(config.framework).toBe('nextjs')
    expect(config.health_check_path).toBe('/api/health')
    expect(result.required_env_vars).toContain('TERMINAL_AI_GATEWAY_URL')
  })

  it('includes fetchWithRetry with 429 retry logic in nextjs+ai scaffold', () => {
    const result = scaffoldApp({
      framework: 'nextjs',
      app_name: 'Test App',
      description: 'test',
      category: 'test',
      uses_ai: true,
      uses_file_upload: false,
      generates_artifacts: false,
    })
    const sdk = result.files['lib/terminal-ai.ts']
    expect(sdk).toBeDefined()
    expect(sdk).toContain('fetchWithRetry')
    expect(sdk).toContain("throw new Error('Gateway is busy. Please try again in a moment.')")
    expect(sdk).toContain('Retry-After')
  })
})
