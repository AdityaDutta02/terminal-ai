import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { proxy } from './routes/proxy.js'

const app = new Hono()

app.use('*', logger())

app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow requests from terminalai.app subdomains and localhost in dev
      if (
        origin?.endsWith('.terminalai.app') ||
        origin === 'https://terminalai.app' ||
        origin?.startsWith('http://localhost')
      ) {
        return origin
      }
      return null
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/', proxy)

const port = parseInt(process.env.PORT ?? '3001', 10)

export default {
  port,
  fetch: app.fetch,
}
