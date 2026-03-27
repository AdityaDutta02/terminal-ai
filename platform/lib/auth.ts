import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL! }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
          await pool.query('UPDATE "user" SET credits = 200 WHERE id = $1', [user.id])
          await pool.end()
        },
      },
    },
  },
  user: {
    additionalFields: {
      credits: {
        type: 'number',
        defaultValue: 200,
        input: false,
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
