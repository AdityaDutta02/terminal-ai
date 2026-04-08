import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { proxy } from './routes/proxy.js'
import { uploadRouter } from './routes/upload.js'
import { handleGenerate } from './routes/generate.js'
import { gatewayRateLimit } from './middleware/rate-limit.js'
import { embedTokenAuth } from './middleware/auth.js'

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
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0', ts: Date.now() }))

app.use('/v1/*', gatewayRateLimit())

app.route('/upload', uploadRouter)
app.post('/v1/generate', embedTokenAuth, handleGenerate)
app.route('/', proxy)

const port = parseInt(process.env.PORT ?? '3001', 10)

export default {
  port,
  fetch: app.fetch,
}
