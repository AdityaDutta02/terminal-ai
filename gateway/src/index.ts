import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { proxy } from './routes/proxy.js'
import { uploadRouter } from './routes/upload.js'
import { emailRouter } from './routes/email.js'
import { taskRouter } from './routes/tasks.js'
import { gatewayRateLimit } from './middleware/rate-limit.js'
import { embedTokenAuth } from './middleware/auth.js'
import { executeDueTasks } from './workers/task-runner.js'
import { logger as appLogger } from './lib/logger.js'

const app = new Hono()

app.use('*', logger())

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return null
      if (origin === 'https://terminalai.studioionique.com') return origin
      if (/^https:\/\/[a-z0-9-]+\.apps\.terminalai\.app$/.test(origin)) return origin
      // Allow localhost only in development
      if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0', ts: Date.now() }))

app.use('/v1/*', gatewayRateLimit())

app.route('/upload', uploadRouter)
app.route('/', proxy)

// New routes — protected by embedTokenAuth
app.use('/email/*', embedTokenAuth)
app.route('/email', emailRouter)

app.use('/tasks/*', embedTokenAuth)
app.route('/tasks', taskRouter)

// Task runner — ticks every 60 seconds
const TASK_RUNNER_INTERVAL_MS = 60_000
let taskRunnerTimer: ReturnType<typeof setInterval> | null = null

function startTaskRunner(): void {
  taskRunnerTimer = setInterval(async () => {
    try {
      await executeDueTasks()
    } catch (err) {
      appLogger.error({ msg: 'task_runner_error', err: String(err) })
    }
  }, TASK_RUNNER_INTERVAL_MS)
  appLogger.info({ msg: 'task_runner_started', intervalMs: TASK_RUNNER_INTERVAL_MS })
}

startTaskRunner()

const port = parseInt(process.env.PORT ?? '3001', 10)

export default {
  port,
  fetch: app.fetch,
}
