import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {salesReportQuerySchema,SalesReportError,
  type SalesReportService} from './sales-report.js';
import type {CatalogPrincipal} from '../catalog/service.js';

/**
 * POS-026 opt-in/test-injected only. Production/development main.ts does NOT
 * mount this route. A future real password login and D-013 device policy are
 * needed before opening staff reporting HTTP endpoints.
 */
export type SalesReportRouteOptions=Readonly<{
  service:Pick<SalesReportService,'report'>;
  resolvePrincipal:(request:FastifyRequest)=>Promise<CatalogPrincipal|null>;
}>;
export function registerSalesReportRoutes(
  app:FastifyInstance,opts:SalesReportRouteOptions):void {
  app.get('/v1/reports/sales',async(request:FastifyRequest,reply:FastifyReply)=>{
    reply.header('Cache-Control','no-store');
    try{
      const principal=await opts.resolvePrincipal(request);
      if(!principal)return reply.code(401).send({error:'UNAUTHORIZED'});
      const query=salesReportQuerySchema.parse(request.query);
      return reply.code(200).send(await opts.service.report(principal,query));
    }catch(error){
      if(error instanceof z.ZodError)
        return reply.code(400).send({error:'VALIDATION_ERROR'});
      if(error instanceof SalesReportError)
        return reply.code(error.httpStatus).send({error:error.code});
      return reply.code(503).send({error:'REPORT_UNAVAILABLE'});
    }
  });
}
