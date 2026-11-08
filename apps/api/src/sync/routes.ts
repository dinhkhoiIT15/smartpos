import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parsePushBatch, PUSH_MAX_BYTES } from './schema.js';
import { SyncApplyError, type SyncPushService, type VerifiedSyncContext } from './service.js';

/**
 * D-013 must provide an independently cryptographically verified device/
 * cashier/offline-grant principal. This route is OPTIONAL for isolated
 * Fastify.inject tests only; production main.ts supplies no sync options.
 * Do NOT resolve principal from x-role/x-device headers or the payload.
 */
export type SyncApi=Pick<SyncPushService,'push'>;
export type SyncRouteOptions=Readonly<{
  service:SyncApi;
  resolvePrincipal:(request:FastifyRequest)=>Promise<VerifiedSyncContext|null>;
}>;

export function registerSyncRoutes(app:FastifyInstance,options:SyncRouteOptions):void{
  app.post('/v1/sync/push',{bodyLimit:PUSH_MAX_BYTES},async(request:FastifyRequest,reply:FastifyReply)=>{
    reply.header('Cache-Control','no-store');
    try{
      const actor=await options.resolvePrincipal(request);
      if(!actor)throw new SyncApplyError('UNAUTHORIZED',401);
      // An explicit protocol mismatch has its own v1 error envelope.
      if(request.body && typeof request.body==='object' &&
         'protocolVersion' in request.body &&
         (request.body as {protocolVersion?:unknown}).protocolVersion!==1){
        return reply.code(409).send({
          error:'UNSUPPORTED_VERSION',supportedProtocolVersions:[1],
        });
      }
      const batch=parsePushBatch(request.body);
      return reply.code(200).send(await options.service.push(actor,batch));
    }catch(error){
      if(error instanceof z.ZodError)return reply.code(400).send({error:'VALIDATION_ERROR'});
      if(error instanceof SyncApplyError){
        const errorName=error.code==='DATABASE_UNAVAILABLE'?'SYNC_UNAVAILABLE':error.code;
        return reply.code(error.httpStatus).send({error:errorName});
      }
      if(error instanceof Error && error.message==='SYNC_PAYLOAD_TOO_LARGE'){
        return reply.code(413).send({error:'PAYLOAD_TOO_LARGE'});
      }
      if(error instanceof Error && error.message==='SYNC_INVALID_EVENT'){
        return reply.code(400).send({error:'VALIDATION_ERROR'});
      }
      return reply.code(503).send({error:'SYNC_UNAVAILABLE'});
    }
  });
}
