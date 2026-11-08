import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { type CatalogPullService, SyncPullError, parsePullQuery } from './pull-service.js';
import type { VerifiedSyncContext } from './service.js';

/**
 * POS-023 opt-in route for Fastify.inject with synthetic trusted resolver.
 * Never mounted in real API startup. D-013 cryptographic proof is missing.
 */
export type SyncPullRouteOptions=Readonly<{
 service:Pick<CatalogPullService,'pull'>;
 resolvePrincipal:(request:FastifyRequest)=>Promise<VerifiedSyncContext|null>;
}>;
export function registerSyncPullRoutes(app:FastifyInstance,opts:SyncPullRouteOptions):void{
 app.get('/v1/sync/pull',async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  try{
   const actor=await opts.resolvePrincipal(request);
   if(!actor)return reply.code(401).send({error:'UNAUTHORIZED'});
   const query=request.query;
   if(!query||typeof query!=='object'||Array.isArray(query))
      return reply.code(400).send({error:'VALIDATION_ERROR'});
   const params=query as Record<string,unknown>;
   if(Object.keys(params).some(k=>!['cursor','limit'].includes(k)))
      return reply.code(400).send({error:'VALIDATION_ERROR'});
   const checked=parsePullQuery(params);
   const page=await opts.service.pull(actor,checked);
   return reply.code(200).send(page);
  }catch(error){
   if(error instanceof z.ZodError)return reply.code(400).send({error:'VALIDATION_ERROR'});
   if(error instanceof SyncPullError){
     return reply.code(error.httpStatus).send({error:error.code});
   }
   return reply.code(503).send({error:'TEMPORARY_UNAVAILABLE'});
  }
 });
}
