import { Queue } from 'bullmq'
const connection = {
  host: process.env.REDIS_HOST ?? 'redis',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
}
export const deployQueue = new Queue('deploys', { connection })
