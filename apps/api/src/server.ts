import Fastify, { type FastifyInstance } from 'fastify';

/** Pure Fastify factory; no network listen, credentials, or database required by tests. */
export function buildServer(options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024,
  });

  // Liveness ONLY. Do not claim Neon/SQLite readiness from this endpoint.
  app.get('/v1/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { status: 'ok', service: 'smartpos-api' };
  });

  return app;
}
