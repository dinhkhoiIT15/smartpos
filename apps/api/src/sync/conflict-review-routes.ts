import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ConflictReviewError, conflictListQuerySchema, conflictReviewSchema,
  type ConflictPrincipal, type ConflictReviewService,
} from './conflict-review.js';

/**
 * Test-only trusted-principal adapter. Normal main.ts MUST NOT provide this
 * option until real server-side staff auth/RBAC (D-013/POS-025) is approved.
 * Spoofable client headers, body role and store IDs are never principals.
 */
export type ConflictRouteOptions = Readonly<{
  service: Pick<ConflictReviewService, 'list' | 'get' | 'resolve'>;
  resolvePrincipal: (request: FastifyRequest) => Promise<ConflictPrincipal | null>;
}>;

export function registerConflictReviewRoutes(app: FastifyInstance,
  options: ConflictRouteOptions): void {
  const wrap = (
    action: (actor: ConflictPrincipal, request: FastifyRequest) => Promise<unknown>,
  ) => async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.header('Cache-Control', 'no-store');
    try {
      const actor = await options.resolvePrincipal(request);
      if (!actor || !z.uuid().safeParse(actor.userId).success ||
          !z.uuid().safeParse(actor.storeId).success)
        throw new ConflictReviewError('UNAUTHORIZED', 401);
      if (actor.role !== 'MANAGER' && actor.role !== 'ADMIN')
        throw new ConflictReviewError('FORBIDDEN', 403);
      const result = await action(actor, request);
      await reply.code(200).send(result);
    } catch (error) {
      if (error instanceof z.ZodError)
        await reply.code(400).send({error: 'VALIDATION_ERROR'});
      else if (error instanceof ConflictReviewError)
        await reply.code(error.httpStatus).send({error: error.code});
      else await reply.code(503).send({error: 'DATABASE_UNAVAILABLE'});
    }
  };
  const conflictId = (request: FastifyRequest): string => {
    const {id} = request.params as {id?: unknown};
    return z.uuid().parse(id);
  };
  app.get('/v1/sync/conflicts', wrap(async (actor, request) =>
    options.service.list(actor, conflictListQuerySchema.parse(request.query))));
  app.get('/v1/sync/conflicts/:id', wrap(async (actor, request) =>
    options.service.get(actor, conflictId(request))));
  app.post('/v1/sync/conflicts/:id/resolve', wrap(async (actor, request) =>
    options.service.resolve(actor, conflictId(request),
      conflictReviewSchema.parse(request.body))));
}
