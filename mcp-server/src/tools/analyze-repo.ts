export interface RiskFlag {
  severity: 'critical' | 'high' | 'medium' | 'low'
  pattern: string
  file: string
  line: number
  message: string
}

export interface MigrationChecklistItem {
  category: 'auth' | 'db' | 'storage' | 'unsupported' | 'security'
  count?: number
  tables?: string[]
  patterns?: string[]
  effort: 'low' | 'medium' | 'high'
  action: string
}

export interface AnalyzeRepoResult {
  risk_flags: RiskFlag[]
  migration_checklist: MigrationChecklistItem[]
  compat_shim_coverage: number
  estimated_effort: 'low' | 'medium' | 'high'
  env_vars_to_add: string[]
  env_vars_to_remove: string[]
  halted_on_critical: boolean
}

interface DetectionRule {
  pattern: RegExp
  category: 'auth' | 'db' | 'storage' | 'unsupported' | 'security'
  severity: 'critical' | 'high' | 'medium' | 'low'
  shimCovered: boolean
  message: string
  action: string
}

const DETECTION_RULES: DetectionRule[] = [
  {
    pattern: /SUPABASE_SERVICE_ROLE_KEY|service_role/,
    category: 'security',
    severity: 'critical',
    shimCovered: false,
    message: 'Service role key must never be deployed to Terminal AI',
    action: 'Remove service role key entirely — Terminal AI gateway handles auth at the gateway layer',
  },
  {
    pattern: /supabase\.auth\.getUser\s*\(/,
    category: 'auth',
    severity: 'high',
    shimCovered: true,
    message: 'getUser() replaced by /compat/supabase/auth/v1/user or useEmbedToken()',
    action: 'Replace with /compat/supabase/auth/v1/user or remove — shim covers this',
  },
  {
    pattern: /supabase\.auth\.signIn|supabase\.auth\.signUp|supabase\.auth\.signOut/,
    category: 'auth',
    severity: 'high',
    shimCovered: true,
    message: 'Auth sign-in/sign-up/sign-out are no-ops on Terminal AI',
    action: 'Shim returns 200 no-op — remove or replace with useEmbedToken() pattern',
  },
  {
    pattern: /supabase\.from\s*\(['"]/,
    category: 'db',
    severity: 'medium',
    shimCovered: true,
    message: 'PostgREST DB call — shim translates CRUD to Terminal AI gateway',
    action: 'Shim covers CRUD — RLS is NOT enforced, gateway layer secures access',
  },
  {
    pattern: /supabase\.storage\.from\s*\(['"]/,
    category: 'storage',
    severity: 'low',
    shimCovered: true,
    message: 'Storage call — shim translates to Terminal AI storage',
    action: 'Shim covers upload/download/delete/list — bucket name becomes key prefix',
  },
  {
    pattern: /supabase\.functions\.invoke\s*\(/,
    category: 'unsupported',
    severity: 'high',
    shimCovered: false,
    message: 'Edge Functions have no equivalent on Terminal AI',
    action: 'No equivalent — must remove or redesign as API route in your Next.js app',
  },
  {
    pattern: /supabase\.channel\s*\(|\.realtime\./,
    category: 'unsupported',
    severity: 'high',
    shimCovered: false,
    message: 'Realtime subscriptions have no equivalent on Terminal AI',
    action: 'No equivalent — must remove or redesign',
  },
  {
    pattern: /supabase\.rpc\s*\(/,
    category: 'db',
    severity: 'medium',
    shimCovered: false,
    message: 'Custom RPC procedures require manual rewrite',
    action: 'Shim returns 501 — migrate to application-level logic or a gateway route',
  },
  {
    pattern: /CREATE POLICY|ENABLE ROW LEVEL SECURITY|auth\.uid\s*\(\)/,
    category: 'security',
    severity: 'high',
    shimCovered: false,
    message: 'RLS policies are silently lost — Terminal AI has no Postgres-level user context',
    action: 'Add viewer_id column and filter in application code; shim secures at gateway layer',
  },
]

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py'])
const SQL_EXTENSION = '.sql'
const MAX_FILES = 200

function parseOwnerRepo(githubRepo: string): { owner: string; repo: string } {
  const url = new URL(githubRepo)
  const parts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
  if (parts.length < 2) throw new Error(`Cannot parse GitHub repo URL: ${githubRepo}`)
  return { owner: parts[0], repo: parts[1] }
}

export async function analyzeRepo(
  githubRepo: string,
  branch = 'main',
  githubToken?: string,
): Promise<AnalyzeRepoResult> {
  const { owner, repo } = parseOwnerRepo(githubRepo)

  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`

  // Fetch tree via GitHub Trees API
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  const treeRes = await fetch(treeUrl, { headers })
  if (!treeRes.ok) throw new Error(`GitHub Trees API error: ${treeRes.status}`)
  const treeData = await treeRes.json() as { tree: Array<{ path: string; type: string }> }

  const filePaths = treeData.tree
    .filter((node) => node.type === 'blob')
    .map((node) => node.path)
    .filter((path) => {
      const ext = '.' + path.split('.').pop()
      return SCANNABLE_EXTENSIONS.has(ext) || ext === SQL_EXTENSION
    })
    .slice(0, MAX_FILES)

  // Fetch and scan files
  const riskFlags: RiskFlag[] = []
  const matchCounts: Map<DetectionRule, number> = new Map(DETECTION_RULES.map((r) => [r, 0]))

  for (const filePath of filePaths) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
    const fileRes = await fetch(rawUrl, { headers })
    if (!fileRes.ok) continue
    const content = await fileRes.text()

    const lines = content.split('\n')
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]
      for (const rule of DETECTION_RULES) {
        if (rule.pattern.test(line)) {
          matchCounts.set(rule, (matchCounts.get(rule) ?? 0) + 1)
          riskFlags.push({
            severity: rule.severity,
            pattern: rule.pattern.source,
            file: filePath,
            line: lineIdx + 1,
            message: rule.message,
          })
        }
      }
    }
  }

  // Check for critical halt
  const hasCritical = riskFlags.some((f) => f.severity === 'critical')
  if (hasCritical) {
    return {
      risk_flags: riskFlags.filter((f) => f.severity === 'critical'),
      migration_checklist: [],
      compat_shim_coverage: 0,
      estimated_effort: 'high',
      env_vars_to_add: [],
      env_vars_to_remove: [],
      halted_on_critical: true,
    }
  }

  // Build migration checklist from match counts
  const checklist: MigrationChecklistItem[] = []
  const categoryTotals = new Map<string, { count: number; covered: number }>()

  for (const [rule, count] of matchCounts) {
    if (count === 0) continue
    const cat = rule.category
    const existing = categoryTotals.get(cat) ?? { count: 0, covered: 0 }
    categoryTotals.set(cat, {
      count: existing.count + count,
      covered: existing.covered + (rule.shimCovered ? count : 0),
    })
  }

  for (const [category, totals] of categoryTotals) {
    const effort: 'low' | 'medium' | 'high' =
      category === 'auth' ? 'high' : category === 'unsupported' ? 'high' : 'medium'
    const rule = DETECTION_RULES.find((r) => r.category === category)!
    checklist.push({
      category: category as MigrationChecklistItem['category'],
      count: totals.count,
      effort,
      action: rule.action,
    })
  }

  // Compute compat_shim_coverage
  let totalCalls = 0
  let coveredCalls = 0
  for (const [rule, count] of matchCounts) {
    totalCalls += count
    if (rule.shimCovered) coveredCalls += count
  }
  const shimCoverage = totalCalls === 0 ? 1 : coveredCalls / totalCalls

  // Estimate overall effort
  const hasHighEffort = checklist.some((c) => c.effort === 'high')
  const hasMediumEffort = checklist.some((c) => c.effort === 'medium')
  const estimatedEffort: 'low' | 'medium' | 'high' = hasHighEffort
    ? 'high'
    : hasMediumEffort
    ? 'medium'
    : 'low'

  return {
    risk_flags: riskFlags,
    migration_checklist: checklist,
    compat_shim_coverage: shimCoverage,
    estimated_effort: estimatedEffort,
    env_vars_to_add: ['TERMINAL_AI_GATEWAY_URL'],
    env_vars_to_remove: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    halted_on_critical: false,
  }
}
