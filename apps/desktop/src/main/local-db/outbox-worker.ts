import type { DatabaseSync } from 'node:sqlite';
import {
  assertPushResponseMatchesRequest, syncSaleCompletedEventSchema,
  syncPushRequestSchema, type SyncPushRequest, type SyncPushResponse,
} from '@smartpos/contracts';
import { withLocalTransaction } from './index.ts';

/**
 * POS-022 — Electron MAIN-only internal outbox dispatcher.
 *
 * NOT ENABLED IN NORMAL APP: There is no real D-013 device key, cashier session,
 * signed grant, authenticated HTTPS transport, or paid-checkout IPC. The
 * transport is INJECTED by standalone tests; no token, URL or fetch is here.
 * A stored offlineGrantId is NOT an authorization credential. Do not construct
 * this class in Electron main until D-013 has been implemented/reviewed.
 *
 * Events are never deleted and their identity/payload are never rewritten.
 * SYNCED needs an exact validated POS-016 ACK, not just an HTTP 200.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_ATTEMPTS=2_147_483_647;
export const OUTBOX_MAX_BACKOFF_MS=3_600_000;
export type OutboxIdentity=Readonly<{storeId:string;deviceId:string}>;
export type OutboxTransport=(request:SyncPushRequest)=>Promise<unknown>;
export type OutboxResult=Readonly<{
  kind:'IDLE'|'ACKED'|'RETRY'|'NEEDS_REVIEW';
  eventId?:string;resultCode?:string;nextRetryAt?:string;
}>;
export type OutboxWorkerOptions=Readonly<{
  identity:OutboxIdentity;
  transport:OutboxTransport;
  now?:()=>number;
  random?:()=>number;
}>;
type Claimed=Readonly<{
  eventId:string;saleId:string;storeId:string;deviceId:string;
  payloadJson:string;payloadHash:string;attemptCount:number;
  createdAt:string;localSaleStoreId:string;localSaleDeviceId:string;
  localSaleCashierId:string;localSaleCreatedAt:string;
}>;
type Selected=Omit<Claimed,'attemptCount'> & {attemptCount:number;state:string};

function invalid(code:string):never{throw new Error('OUTBOX_'+code);}
function checkId(value:string):void{
  if(typeof value!=='string'||!UUID.test(value))invalid('INVALID_IDENTITY');
}
function clockValue(value:number):number{
  if(!Number.isSafeInteger(value)||value<0||value>8_640_000_000_000_000)
    invalid('INVALID_CLOCK');
  return value;
}
const at=(ms:number):string=>new Date(clockValue(ms)).toISOString();

/** Attempts 1..∞; bounded exponential (1s..5m) + 0..20% jitter.
 * Server retryAfterSeconds, when present, acts as a minimum (up to 1h).
 */
export function calculateOutboxRetryMs(
  attempt:number,jitter:number,serverRetryAfterSeconds=0,
):number{
  if(!Number.isSafeInteger(attempt)||attempt<1 ||
     !Number.isFinite(jitter)||jitter<0||jitter>1 ||
     !Number.isSafeInteger(serverRetryAfterSeconds)||
     serverRetryAfterSeconds<0||serverRetryAfterSeconds>3600)
    invalid('INVALID_BACKOFF');
  const base=Math.min(300_000,1000*2**Math.min(attempt-1,9));
  const randomDelay=Math.floor(base*(1+0.2*jitter));
  return Math.min(OUTBOX_MAX_BACKOFF_MS,
    Math.max(randomDelay,serverRetryAfterSeconds*1000));
}

/** Recover after crash/power loss. Only delivery state changes, NEVER sale data. */
export function recoverOrphanedOutbox(
  db:DatabaseSync,identity:OutboxIdentity,
):number{
  checkId(identity.storeId);checkId(identity.deviceId);
  return withLocalTransaction(db,()=>{
    const moved=db.prepare(`UPDATE outbox_events
      SET state='RETRY',next_retry_at=NULL
      WHERE store_id=? AND device_id=? AND state='SYNCING'`)
      .run(identity.storeId,identity.deviceId);
    return Number(moved.changes);
  });
}

/** Manual retry is permitted only for RETRY, never silent auto-clear of NEEDS_REVIEW. */
export function retryOutboxNow(
  db:DatabaseSync,identity:OutboxIdentity,eventId:string,
):boolean{
  checkId(identity.storeId);checkId(identity.deviceId);checkId(eventId);
  return withLocalTransaction(db,()=>db.prepare(`UPDATE outbox_events
    SET next_retry_at=NULL
    WHERE store_id=? AND device_id=? AND event_id=? AND state='RETRY'`)
    .run(identity.storeId,identity.deviceId,eventId).changes===1);
}

function claimOldest(
  db:DatabaseSync,identity:OutboxIdentity,now:string,
):Claimed|null{
  return withLocalTransaction(db,()=>{
    // Device metadata is a consistency check ONLY, not security/authorization.
    const meta=db.prepare(`SELECT device_id FROM local_device_metadata
      WHERE store_id=? AND device_id=?`).get(identity.storeId,identity.deviceId);
    if(!meta)invalid('DEVICE_SCOPE');

    const selected=db.prepare(`
      SELECT o.event_id AS eventId,o.sale_id AS saleId,
        o.store_id AS storeId,o.device_id AS deviceId,
        o.payload_json AS payloadJson,o.payload_hash AS payloadHash,
        o.attempt_count AS attemptCount,o.created_at AS createdAt,
        o.state AS state,
        s.store_id AS localSaleStoreId,s.device_id AS localSaleDeviceId,
        s.cashier_id AS localSaleCashierId,
        s.client_created_at AS localSaleCreatedAt
      FROM outbox_events o
      JOIN local_sales s ON s.sale_id=o.sale_id AND s.store_id=o.store_id
      WHERE o.store_id=? AND o.device_id=?
        AND (o.state='PENDING' OR
            (o.state='RETRY' AND (o.next_retry_at IS NULL OR o.next_retry_at<=?)))
      ORDER BY o.created_at ASC,o.event_id ASC LIMIT 1
    `).get(identity.storeId,identity.deviceId,now) as Selected|undefined;
    if(!selected)return null;
    if(!Number.isSafeInteger(selected.attemptCount) ||
        selected.attemptCount<0||selected.attemptCount>=MAX_ATTEMPTS)
      invalid('ATTEMPT_OVERFLOW');

    const updated=db.prepare(`UPDATE outbox_events
      SET state='SYNCING',attempt_count=attempt_count+1,next_retry_at=NULL
      WHERE event_id=? AND store_id=? AND device_id=? AND state=? AND attempt_count=?`)
      .run(selected.eventId,identity.storeId,identity.deviceId,
        selected.state,selected.attemptCount);
    if(updated.changes!==1)invalid('CLAIM_RACE');
    return {...selected,attemptCount:selected.attemptCount+1};
  });
}

function eventRequest(claim:Claimed):SyncPushRequest{
  let decoded:unknown;
  try{decoded=JSON.parse(claim.payloadJson);}
  catch{invalid('INVALID_STORED_EVENT');}
  const event=syncSaleCompletedEventSchema.parse(decoded);
  if(event.eventId!==claim.eventId||event.saleId!==claim.saleId||
     event.deviceId!==claim.deviceId||event.storeId!==claim.storeId||
     event.cashierId!==claim.localSaleCashierId ||
     event.clientCreatedAt!==claim.localSaleCreatedAt||
     claim.localSaleStoreId!==claim.storeId||
     claim.localSaleDeviceId!==claim.deviceId||
     event.payloadHash!==claim.payloadHash)invalid('PAYLOAD_SCOPE');
  return syncPushRequestSchema.parse({
    protocolVersion:1,deviceId:claim.deviceId,events:[event],
  });
}

function commitOutcome(
  db:DatabaseSync,claim:Claimed,
  state:'SYNCED'|'RETRY'|'NEEDS_REVIEW',
  saleState:'SYNCED'|'PENDING_SYNC'|'NEEDS_REVIEW',
  ackJson:string|null,nextRetryAt:string|null,
):void{
  withLocalTransaction(db,()=>{
    const updated=db.prepare(`UPDATE outbox_events
      SET state=?,ack_json=?,next_retry_at=?
      WHERE event_id=? AND sale_id=? AND store_id=? AND device_id=?
        AND state='SYNCING' AND attempt_count=?`)
      .run(state,ackJson,nextRetryAt,claim.eventId,claim.saleId,
        claim.storeId,claim.deviceId,claim.attemptCount);
    if(updated.changes!==1)invalid('STATE_RACE');
    const sale=db.prepare(`UPDATE local_sales SET sync_status=?
      WHERE sale_id=? AND store_id=? AND device_id=?`)
      .run(saleState,claim.saleId,claim.storeId,claim.deviceId);
    if(sale.changes!==1)invalid('SALE_STATE_RACE');
    // A failed second UPDATE must roll back the first one too. Neither
    // local_sales financial columns nor pending_delta are touched.
  });
}

/** Outcome is sourced ONLY from strict POS-016 matching request/response. */
function classifyAck(result:SyncPushResponse['results'][number]):{
  state:'SYNCED'|'RETRY'|'NEEDS_REVIEW';
  saleState:'SYNCED'|'PENDING_SYNC'|'NEEDS_REVIEW';
} {
  if(result.status==='ACKED'){
    // Sale reached server, but reconciliation conflict still needs manager UI.
    return {state:'SYNCED',saleState:result.resultCode==='APPLIED'?'SYNCED':'NEEDS_REVIEW'};
  }
  if(result.status==='NEEDS_REVIEW')return {state:'NEEDS_REVIEW',saleState:'NEEDS_REVIEW'};
  return {state:'RETRY',saleState:'PENDING_SYNC'};
}

/** No timers/network unless an explicitly injected test/signed transport starts it. */
export class OutboxRetryWorker {
  private readonly clock:()=>number;
  private readonly jitter:()=>number;
  private inflight:Promise<OutboxResult>|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  constructor(
    private readonly db:DatabaseSync,
    private readonly options:OutboxWorkerOptions,
  ){
    checkId(options.identity.storeId);checkId(options.identity.deviceId);
    this.clock=options.now??Date.now;
    this.jitter=options.random??Math.random;
  }

  /** Serialize overlapping timer/reconnect/manual ticks within this instance. */
  runOnce():Promise<OutboxResult>{
    if(this.inflight)return this.inflight;
    const running=this.dispatch();
    this.inflight=running;
    void running.then(()=>{if(this.inflight===running)this.inflight=null;},
      ()=>{if(this.inflight===running)this.inflight=null;});
    return running;
  }

  private async dispatch():Promise<OutboxResult>{
    const claim=claimOldest(this.db,this.options.identity,at(this.clock()));
    if(!claim)return {kind:'IDLE'};
    let request:SyncPushRequest;
    try{request=eventRequest(claim);}
    catch{
      commitOutcome(this.db,claim,'NEEDS_REVIEW','NEEDS_REVIEW',null,null);
      return {kind:'NEEDS_REVIEW',eventId:claim.eventId,resultCode:'INVALID_EVENT'};
    }
    let reply:unknown;
    try{reply=await this.options.transport(request);}
    catch{return this.retry(claim);}
    let result:SyncPushResponse['results'][number];
    try{
      const verified=assertPushResponseMatchesRequest(request,reply);
      result=verified.results[0]!;
    }catch{
      // A transport response is not an ACK unless it matches *all* v1
      // identities and fields. Preserve local sale and flag security review.
      commitOutcome(this.db,claim,'NEEDS_REVIEW','NEEDS_REVIEW',null,null);
      return {kind:'NEEDS_REVIEW',eventId:claim.eventId,resultCode:'INVALID_ACK'};
    }
    const classified=classifyAck(result);
    if(classified.state==='RETRY')
      return this.retry(claim,result.retryAfterSeconds);
    commitOutcome(this.db,claim,classified.state,classified.saleState,
      JSON.stringify(result),null);
    return {kind:classified.state==='SYNCED'?'ACKED':'NEEDS_REVIEW',
      eventId:claim.eventId,resultCode:result.resultCode};
  }

  private retry(claim:Claimed,retryAfterSeconds=0):OutboxResult{
    const delay=calculateOutboxRetryMs(claim.attemptCount,this.jitter(),retryAfterSeconds);
    const nextRetryAt=at(clockValue(this.clock())+delay);
    commitOutcome(this.db,claim,'RETRY','PENDING_SYNC',null,nextRetryAt);
    return {kind:'RETRY',eventId:claim.eventId,
      resultCode:'TEMPORARY_UNAVAILABLE',nextRetryAt};
  }

  /** Explicit opt-in only: recover orphaned claims before polling.
   * No Electron app startup invokes this in POS-022.
   */
  start(intervalMs=5000):number{
    if(!Number.isSafeInteger(intervalMs)||intervalMs<250||intervalMs>3600000)
      invalid('INVALID_POLL_INTERVAL');
    if(this.timer)invalid('ALREADY_STARTED');
    const recovered=recoverOrphanedOutbox(this.db,this.options.identity);
    this.timer=setInterval(()=>{
      void this.runOnce().catch(()=>{/* error remains in SQLite or caller logs */});
    },intervalMs);
    this.timer.unref?.();
    return recovered;
  }
  async stop():Promise<void>{
    if(this.timer){clearInterval(this.timer);this.timer=null;}
    if(this.inflight)await this.inflight;
  }
}
