import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { assertCatalogRole, CatalogError, type CatalogPrincipal, type CatalogService } from './service.js';

/**
 * POS-014 routes deliberately require a trusted server principal resolver.
 * The normal main.ts never registers them: real authentication is NOT ready.
 * Never derive roles/store IDs from request JSON, query, path or x-role headers.
 */
export type CatalogApi = Pick<CatalogService,
  'createCategory' | 'updateCategory' | 'createBrand' | 'updateBrand' |
  'createProduct' | 'updateProduct' | 'createVariant' | 'updateVariant' |
  'getProduct' | 'getVariant' | 'listProducts' | 'listVariants'>;

export type CatalogRouteOptions = {
  service: CatalogApi;
  /**
   * This must perform *real* server-side session validation in a future issue.
   * Test-only fixtures may return synthetic principals via app.inject().
   */
  resolvePrincipal: (request: FastifyRequest) => Promise<CatalogPrincipal | null>;
};

const idFrom = (request: FastifyRequest): string => {
  const params = request.params as { id?: unknown };
  return z.uuid().parse(params.id);
};

export function registerCatalogRoutes(app: FastifyInstance, options: CatalogRouteOptions): void {
  function wrap(
    write: boolean, statusCode: number,
    action: (actor: CatalogPrincipal, request: FastifyRequest) => Promise<unknown>,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request, reply) => {
      try {
        const actor = await options.resolvePrincipal(request);
        assertCatalogRole(actor, write);
        const result = await action(actor, request);
        reply.header('Cache-Control', 'no-store');
        await reply.code(statusCode).send(result);
      } catch (error) {
        // No raw PostgreSQL/credential or Zod parsed input ever gets exposed.
        if (error instanceof z.ZodError) {
          await reply.code(400).send({ error: 'VALIDATION_ERROR' });
        } else if (error instanceof CatalogError) {
          await reply.code(error.httpStatus).send({ error: error.code });
        } else {
          await reply.code(503).send({ error: 'CATALOG_UNAVAILABLE' });
        }
      }
    };
  }

  app.post('/v1/catalog/categories', wrap(true, 201, (a, req) => options.service.createCategory(a, req.body)));
  app.patch('/v1/catalog/categories/:id', wrap(true, 200, (a, req) =>
    options.service.updateCategory(a, idFrom(req), req.body)));
  app.post('/v1/catalog/brands', wrap(true, 201, (a, req) => options.service.createBrand(a, req.body)));
  app.patch('/v1/catalog/brands/:id', wrap(true, 200, (a, req) =>
    options.service.updateBrand(a, idFrom(req), req.body)));

  app.post('/v1/catalog/products', wrap(true, 201, (a, req) => options.service.createProduct(a, req.body)));
  app.patch('/v1/catalog/products/:id', wrap(true, 200, (a, req) =>
    options.service.updateProduct(a, idFrom(req), req.body)));
  app.get('/v1/catalog/products', wrap(false, 200, (a, req) => options.service.listProducts(a, req.query)));
  app.get('/v1/catalog/products/:id', wrap(false, 200, (a, req) =>
    options.service.getProduct(a, idFrom(req))));

  app.post('/v1/catalog/variants', wrap(true, 201, (a, req) => options.service.createVariant(a, req.body)));
  app.patch('/v1/catalog/variants/:id', wrap(true, 200, (a, req) =>
    options.service.updateVariant(a, idFrom(req), req.body)));
  app.get('/v1/catalog/variants', wrap(false, 200, (a, req) => options.service.listVariants(a, req.query)));
  app.get('/v1/catalog/variants/:id', wrap(false, 200, (a, req) =>
    options.service.getVariant(a, idFrom(req))));
}
