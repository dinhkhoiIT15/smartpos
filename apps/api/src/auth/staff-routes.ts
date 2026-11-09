import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  bearerFromAuthorization, StaffAuthError, type StaffPrincipal,
  type StaffSessionService,
} from './staff-sessions.js';
import type { CatalogPrincipal } from '../catalog/service.js';

/** Test-only opt-in Fastify adapter: NO LOGIN or token issuance endpoint.
 * main.ts MUST NEVER mount this until reviewed online identity verification,
 * rate limits, HTTPS, secure credential storage, D-013 device keys exist.
 */
export type StaffRoutesOptions = Readonly<{
  service: Pick<StaffSessionService,'resolve'|'revokeOwn'|'changeMember'>;
}>;

export function createStaffPrincipalResolver(
  service: Pick<StaffSessionService,'resolve'>,
): (request: FastifyRequest) => Promise<CatalogPrincipal | null> {
  return async request => {
    try {
      const token=bearerFromAuthorization(request.headers.authorization);
      const user=await service.resolve(token);
      return {storeId:user.storeId,userId:user.userId,role:user.role};
    } catch(error) {
      if (error instanceof StaffAuthError && error.code==='UNAUTHORIZED') return null;
      throw error;
    }
  };
}
export function registerStaffRoutes(app:FastifyInstance,options:StaffRoutesOptions):void {
  const wrap = (
    perform:(request:FastifyRequest,principal:StaffPrincipal,token:string)=>Promise<unknown>,
  ) => async(request:FastifyRequest,reply:FastifyReply):Promise<void> => {
    reply.header('Cache-Control','no-store');
    try {
      const token=bearerFromAuthorization(request.headers.authorization);
      const principal=await options.service.resolve(token);
      const result=await perform(request,principal,token);
      await reply.code(200).send(result);
    } catch(error) {
      if (error instanceof z.ZodError) {
        await reply.code(400).send({error:'VALIDATION_ERROR'});
      } else if (error instanceof StaffAuthError) {
        await reply.code(error.httpStatus).send({error:error.code});
      } else {
        await reply.code(503).send({error:'DATABASE_UNAVAILABLE'});
      }
    }
  };
  app.get('/v1/staff/me',wrap(async(_request,principal)=>({
    sessionId:principal.sessionId,userId:principal.userId,
    storeId:principal.storeId,role:principal.role,
  })));
  app.post('/v1/staff/logout',wrap(async(_request,_principal,token)=>
    options.service.revokeOwn(token)));
  app.patch('/v1/staff/members/:userId',wrap(async(request,principal,token)=>{
    if(principal.role!=='ADMIN')throw new StaffAuthError('FORBIDDEN',403);
    const target=z.uuid().parse((request.params as {userId?:unknown}).userId);
    return options.service.changeMember(token,target,request.body);
  }));
}
