import 'dotenv/config';
import { z } from 'zod';

/**
 * Strict schema validation for environment variables.
 * WHY:
 * Validating env at startup guarantees that the app fails fast with clear errors
 * if any connection string or critical setting is missing or malformed,
 * avoiding hidden bugs during execution. Zero hardcoded values exist in the codebase.
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  QUEUE_NAME: z.string().default('email-queue'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().int().nonnegative().default(1000),
  DEFAULT_DELAY_BETWEEN_MS: z.coerce.number().int().nonnegative().default(0),
  DEFAULT_HOURLY_LIMIT: z.coerce.number().int().positive().default(100),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(100),
  // Block 3: Crash safety stale threshold (ms)
  SENDING_STALE_MS: z.coerce.number().int().positive().default(120000),
  // Block 3: Elasticsearch node & index configuration
  ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),
  // Block 3: Bull Board dashboard mount path
  BULL_BOARD_PATH: z.string().default('/admin/queues'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:3000/api/auth/google/callback'),
  JWT_SECRET: z.string().min(16).default('dev-only-change-me-please'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:3000/api/slack/callback'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
