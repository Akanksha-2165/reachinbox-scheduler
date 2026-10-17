import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { redisConnectionOptions } from '../config/redis.js';

export interface EmailJobData {
  emailId: string;
  hourlyLimit?: number;
}

export const EMAIL_JOB_NAME = 'send-email';

/**
 * BullMQ Queue for dispatching email send jobs.
 *
 * WHY:
 * Using BullMQ delayed jobs backed by Redis (with AOF persistence) guarantees
 * that all scheduled emails survive server restarts. BullMQ tracks the exact
 * execution timestamp internally without requiring any cron processes.
 */
export const emailQueue = new Queue<EmailJobData>(env.QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: false, // Retain job history for queue monitoring
    removeOnFail: false,     // Retain failed jobs for inspection
  },
});
