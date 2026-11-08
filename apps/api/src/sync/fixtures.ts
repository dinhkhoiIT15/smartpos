import { randomUUID } from 'node:crypto';
import { hashPushEvent, type PushEvent, type PushBatch } from './schema.js';

/** Synthetic CI-only helpers. Never import into main.ts or any network route. */
export type TestIds=Readonly<{
  storeId:string;deviceId:string;cashierId:string;offlineGrantId:string;
  phoneId:string;caseId:string;
}>;
export function sampleIds():TestIds{
  return {storeId:randomUUID(),deviceId:randomUUID(),cashierId:randomUUID(),
    offlineGrantId:randomUUID(),phoneId:randomUUID(),caseId:randomUUID()};
}
export function sampleEvent(ids:TestIds,patch:Partial<PushEvent>={}):PushEvent{
  const body={
    schemaVersion:1 as const,eventType:'SALE_COMPLETED' as const,
    eventId:randomUUID(),saleId:randomUUID(),storeId:ids.storeId,
    deviceId:ids.deviceId,cashierId:ids.cashierId,offlineGrantId:ids.offlineGrantId,
    clientCreatedAt:'2026-11-08T01:00:00.000Z',catalogRevision:'42',
    sale:{
      status:'POSTED' as const,totalVnd:'9340000',
      items:[
        {itemId:randomUUID(),variantId:ids.phoneId,skuSnapshot:'PHONE-128',
          nameSnapshot:'Điện thoại 128GB',attributesSnapshot:{storage:'128GB'},
          quantity:1,unitPriceVnd:'8990000',discountVnd:'0',lineTotalVnd:'8990000'},
        {itemId:randomUUID(),variantId:ids.caseId,skuSnapshot:'CASE-01',
          nameSnapshot:'Ốp lưng',attributesSnapshot:{color:'Đen'},
          quantity:1,unitPriceVnd:'350000',discountVnd:'0',lineTotalVnd:'350000'},
      ],
      payment:{method:'CASH' as const,dueVnd:'9340000',
        tenderedVnd:'9500000',changeVnd:'160000'},
    },
    ...patch,
  };
  const {payloadHash:_,...withoutHash}=body as typeof body & {payloadHash?:string};
  return {...withoutHash,payloadHash:hashPushEvent(withoutHash)};
}
export const sampleBatch=(ids:TestIds,events:PushEvent[]):PushBatch=>({
  protocolVersion:1,deviceId:ids.deviceId,events,
});
