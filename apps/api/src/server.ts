import Fastify, { type FastifyInstance } from 'fastify';
import { registerCatalogRoutes, type CatalogRouteOptions } from './catalog/routes.js';
import { registerInventoryRoutes, type InventoryRouteOptions } from './inventory/routes.js';
import { registerSyncRoutes, type SyncRouteOptions } from './sync/routes.js';
import { registerSyncPullRoutes,type SyncPullRouteOptions } from './sync/pull-routes.js';

/** Pure Fastify factory; no network listen, credentials, or database required by tests. */
export function buildServer(options: { logger?: boolean; catalog?: CatalogRouteOptions; inventory?: InventoryRouteOptions; sync?: SyncRouteOptions; syncPull?: SyncPullRouteOptions } = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024,
  });

  // Liveness ONLY. Do not claim Neon/SQLite readiness from this endpoint.
  app.get('/v1/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { status: 'ok', service: 'smartpos-api' };
  });

  // Fail closed: production/dev main.ts supplies no auth provider or catalog DB.
  // Route registration is ONLY allowed via explicit server-side service/auth injection.
  if (options.catalog) registerCatalogRoutes(app, options.catalog);
  // No trusted login resolver in main.ts: inventory is opt-in for test only.
  if (options.inventory) registerInventoryRoutes(app, options.inventory);
  // No D-013 cryptographically verified resolver exists in normal main.ts.
  // This remains unmounted on all real development and production listeners.
  if (options.sync) registerSyncRoutes(app, options.sync);
  // POS-023 PULL remains unmounted until real D-013 trusted principal exists.
  if (options.syncPull) registerSyncPullRoutes(app, options.syncPull);

  return app;
}
