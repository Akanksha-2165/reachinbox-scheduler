import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

const server = app.listen(env.PORT, () => {
  console.log(`🚀 [API Server] Listening on http://localhost:${env.PORT}`);
  console.log(`   - POST /api/schedule`);
  console.log(`   - GET  /api/emails?status=scheduled|sent`);
});

/**
 * Graceful shutdown for API server and database connection pool.
 */
const shutdown = async () => {
  console.log('\n[API Server] Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('[API Server] Disconnected from database.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
