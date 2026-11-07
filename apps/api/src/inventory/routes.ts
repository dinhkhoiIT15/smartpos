import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  InventoryError, type InventoryPrincipal, type InventoryService,
} from './service.js';
import { adjustInventorySchema, inventoryHistoryQuerySchema } from './schemas.js';

/**
 * Opt-in only. Normal Fastify main.ts does NOT inject a trusted auth resolver,
 * so these routes are never registered for unauthenticated network clients.
 * In tests principals are synthetic and no TCP port is opened.
 */
export type InventoryApi = Pick<InventoryService, 'getBalance' | 'listMovements' | 'adjust'>;
export type InventoryRouteOptions = {
  service: InventoryApi;
  resolvePrincipal: (request: FastifyRequest) => Promise<InventoryPrincipal | null>;
};

const variantFrom = (request: FastifyRequest): string =>
  z.uuid().parse((request.params as { variantId?: unknown }).variantId);

export function registerInventoryRoutes(app: FastifyInstance, options: InventoryRouteOptions): void {
  function run(
    method: 'GET' | 'POST', path: string, status: number,
    execute: (actor: InventoryPrincipal, request: FastifyRequest) => Promise<unknown>,
  ): void {
    const handler = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      reply.header('Cache-Control', 'no-store');
      try {
        const actor = await options.resolvePrincipal(request);
        if (!actor) throw new InventoryError('UNAUTHORIZED', 401);
        const output = await execute(actor, request);
        await reply.code(status).send(output);
      } catch (error) {
        if (error instanceof z.ZodError) await reply.code(400).send({ error: 'VALIDATION_ERROR' });
        else if (error instanceof InventoryError) {
          await reply.code(error.httpStatus).send({ error: error.code });
        } else await reply.code(503).send({ error: 'INVENTORY_UNAVAILABLE' });
      }
    };
    if (method === 'GET') app.get(path, handler);
    else app.post(path, handler);
  }

  run('GET', '/v1/inventory/variants/:variantId/balance', 200,
    (actor, request) => options.service.getBalance(actor, variantFrom(request)));

  run('GET', '/v1/inventory/variants/:variantId/movements', 200,
    (actor, request) => options.service.listMovements(
      actor, variantFrom(request), inventoryHistoryQuerySchema.parse(request.query),
    ));

  run('POST', '/v1/inventory/adjustments', 201,
    (actor, request) => options.service.adjust(actor, adjustInventorySchema.parse(request.body)));
}
