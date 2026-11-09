/** POS-025 PostgreSQL 16 disposable CI ONLY; NEVER run on Neon. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildServer} from '../server.js';
import {createStaffPrincipalResolver} from './staff-routes.js';
import {
  StaffSessionService, StaffAuthError, STAFF_MAX_SESSION_SECONDS,
} from './staff-sessions.js';

const urlText=process.env.POS_DB_TEST_URL;
if(!urlText)throw new Error('POS_DB_TEST_URL required for disposable POS-025 CI');
const url=new URL(urlText);
if(url.hostname!=='127.0.0.1'||url.pathname!=='/smartpos_ci'||
   (url.port&&url.port!=='5432'))
  throw new Error('POS-025 tests allow localhost:5432/smartpos_ci ONLY');
const id=()=>randomUUID();
const forbidden=(code:string)=>(error:unknown)=>error instanceof StaffAuthError&&error.code===code;

test('POS-025 PostgreSQL staff RBAC/session revocation/audit invariants',async t=>{
  const pool=new pg.Pool({connectionString:urlText,max:12});
  t.after(async()=>pool.end());
  const staff=new StaffSessionService(pool);
  type Seed=Readonly<{storeId:string;adminId:string;managerId:string;cashierId:string}>;
  async function seed():Promise<Seed>{
    const storeId=id(),adminId=id(),managerId=id(),cashierId=id();
    await pool.query('INSERT INTO stores(id,name) VALUES($1,$2)',[storeId,'POS025 SYNTHETIC']);
    for (const [userId,role] of [
      [adminId,'ADMIN'],[managerId,'MANAGER'],[cashierId,'CASHIER'],
    ]) {
      await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',
        [userId,id()+'@example.test','SYNTHETIC_HASH_NOT_PASSWORD']);
      await pool.query('INSERT INTO store_memberships(store_id,user_id,role) VALUES($1,$2,$3)',
        [storeId,userId,role]);
    }
    return {storeId,adminId,managerId,cashierId};
  }
  const count=async(store:string,action:string)=>{
    const r=await pool.query<{n:string}>(`SELECT count(*)::text AS n FROM audit_logs
      WHERE store_id=$1 AND action=$2`,[store,action]);
    return Number(r.rows[0]?.n??0);
  };

  await t.test('issue only active verified identity; 256-bit token hash, expiry and audit',async()=>{
    const f=await seed();
    const a=await staff.issueForVerifiedIdentity({storeId:f.storeId,userId:f.cashierId});
    const b=await staff.issueForVerifiedIdentity({storeId:f.storeId,userId:f.cashierId});
    assert.equal(a.token.length,43);
    assert.notEqual(a.token,b.token);
    const stored=await pool.query<{token_hash:string;issued_at:Date;expires_at:Date}>(`
      SELECT token_hash,issued_at,expires_at FROM staff_sessions WHERE id=$1`,[a.sessionId]);
    assert.equal(stored.rows[0]?.token_hash,
      createHash('sha256').update(a.token).digest('hex'));
    assert.equal(stored.rows[0]?.token_hash.includes(a.token),false);
    assert.equal((stored.rows[0]!.expires_at.getTime()-stored.rows[0]!.issued_at.getTime())/1000,
      STAFF_MAX_SESSION_SECONDS);
    assert.deepEqual(await staff.resolve(a.token),{
      sessionId:a.sessionId,storeId:f.storeId,userId:f.cashierId,role:'CASHIER',
    });
    assert.equal(await count(f.storeId,'STAFF_SESSION_ISSUED'),2);
    const audited=await pool.query<{metadata:unknown}>(`
      SELECT metadata FROM audit_logs WHERE entity_id=$1
      AND action='STAFF_SESSION_ISSUED'`,[a.sessionId]);
    assert.ok(!JSON.stringify(audited.rows).includes(a.token));
    await assert.rejects(()=>staff.issueForVerifiedIdentity({storeId:id(),userId:f.cashierId}),
      forbidden('UNAUTHORIZED'));
    await assert.rejects(()=>staff.resolve('A'.repeat(43)),forbidden('UNAUTHORIZED'));
    await assert.rejects(()=>staff.resolve('wrong'),forbidden('UNAUTHORIZED'));
  });

  await t.test('live membership/role and expiration immediately change permission',async()=>{
    const f=await seed();
    const manager=await staff.issueForVerifiedIdentity({storeId:f.storeId,userId:f.managerId});
    assert.equal((await staff.resolve(manager.token)).role,'MANAGER');
    await pool.query(`UPDATE store_memberships SET role='CASHIER'
      WHERE store_id=$1 AND user_id=$2`,[f.storeId,f.managerId]);
    assert.equal((await staff.resolve(manager.token)).role,'CASHIER');
    await pool.query(`UPDATE store_memberships SET active=false
      WHERE store_id=$1 AND user_id=$2`,[f.storeId,f.managerId]);
    await assert.rejects(()=>staff.resolve(manager.token),forbidden('UNAUTHORIZED'));
    await pool.query(`UPDATE store_memberships SET active=true
      WHERE store_id=$1 AND user_id=$2`,[f.storeId,f.managerId]);
    await pool.query('UPDATE users SET active=false WHERE id=$1',[f.managerId]);
    await assert.rejects(()=>staff.resolve(manager.token),forbidden('UNAUTHORIZED'));
    await pool.query('UPDATE users SET active=true WHERE id=$1',[f.managerId]);
    await pool.query(`UPDATE staff_sessions SET issued_at=now()-interval '30 minutes',
      expires_at=now()-interval '20 minutes' WHERE id=$1`,[manager.sessionId]);
    await assert.rejects(()=>staff.resolve(manager.token),forbidden('UNAUTHORIZED'));
    await assert.rejects(()=>staff.issueForVerifiedIdentity({storeId:f.storeId,userId:id()}),
      forbidden('UNAUTHORIZED'));
  });

  await t.test('cashier/manager denied staff management, current ADMIN can revoke target',async()=>{
    const f=await seed(),admin=await staff.issueForVerifiedIdentity({
      storeId:f.storeId,userId:f.adminId}),
      manager=await staff.issueForVerifiedIdentity({storeId:f.storeId,userId:f.managerId}),
      cashier=await staff.issueForVerifiedIdentity({storeId:f.storeId,userId:f.cashierId});
    const input={role:'MANAGER',active:true,
      reason:'Promote after verified staff reassignment'};
    await assert.rejects(()=>staff.changeMember(cashier.token,f.cashierId,input),
      forbidden('FORBIDDEN'));
    await assert.rejects(()=>staff.changeMember(manager.token,f.cashierId,input),
      forbidden('FORBIDDEN'));
    const changed=await staff.changeMember(admin.token,f.cashierId,input);
    assert.equal(changed.changed,true);
    assert.equal(changed.revokedSessions,1);
    assert.equal((await staff.issueForVerifiedIdentity({storeId:f.storeId,
      userId:f.cashierId})).userId,f.cashierId);
    await assert.rejects(()=>staff.resolve(cashier.token),forbidden('UNAUTHORIZED'));
    assert.equal(await count(f.storeId,'STAFF_MEMBERSHIP_UPDATED'),1);
    const again=await staff.changeMember(admin.token,f.cashierId,input);
    assert.equal(again.changed,false);
    assert.equal(again.revokedSessions,0);
    assert.equal(await count(f.storeId,'STAFF_MEMBERSHIP_UPDATED'),1);
    await assert.rejects(()=>staff.changeMember(admin.token,f.cashierId,{
      role:'ADMIN',active:true,reason:'short',
    }),error=>error instanceof Error&&error.name==='ZodError');
    assert.equal(await count(f.storeId,'STAFF_MEMBERSHIP_UPDATED'),1);
  });

  await t.test('cross-store scope, last admin protection and self logout audit',async()=>{
    const a=await seed(),b=await seed();
    const admin=await staff.issueForVerifiedIdentity({storeId:a.storeId,userId:a.adminId});
    await assert.rejects(()=>staff.changeMember(admin.token,b.cashierId,{
      role:'MANAGER',active:true,reason:'Cross-store must not be allowed',
    }),forbidden('NOT_FOUND'));
    await assert.rejects(()=>staff.changeMember(admin.token,a.adminId,{
      role:'CASHIER',active:false,reason:'Must preserve one active admin',
    }),forbidden('LAST_ADMIN'));
    assert.equal((await staff.resolve(admin.token)).role,'ADMIN');
    assert.deepEqual(await staff.revokeOwn(admin.token),{revoked:true});
    await assert.rejects(()=>staff.resolve(admin.token),forbidden('UNAUTHORIZED'));
    assert.equal(await count(a.storeId,'STAFF_SESSION_REVOKED'),1);
    const row=await pool.query<{revoked_at:Date|null;revoked_by:string|null}>(`
      SELECT revoked_at,revoked_by FROM staff_sessions WHERE id=$1`,[admin.sessionId]);
    assert.ok(row.rows[0]?.revoked_at);
    assert.equal(row.rows[0]?.revoked_by,a.adminId);
  });

  await t.test('two concurrent admin changes: only one update/audit, one real revocation',async()=>{
    const f=await seed(),admin=await staff.issueForVerifiedIdentity({
      storeId:f.storeId,userId:f.adminId});
    const token=await staff.issueForVerifiedIdentity({
      storeId:f.storeId,userId:f.cashierId});
    const input={role:'CASHIER',active:false,
      reason:'Suspicious register access was reviewed'};
    const outcomes=await Promise.all(Array.from({length:5},
      ()=>staff.changeMember(admin.token,f.cashierId,input)));
    assert.equal(outcomes.filter(x=>x.changed).length,1);
    assert.equal(outcomes.filter(x=>!x.changed).length,4);
    assert.equal(await count(f.storeId,'STAFF_MEMBERSHIP_UPDATED'),1);
    await assert.rejects(()=>staff.resolve(token.token),forbidden('UNAUTHORIZED'));
    await assert.rejects(()=>staff.issueForVerifiedIdentity({
      storeId:f.storeId,userId:f.cashierId}),forbidden('UNAUTHORIZED'));
  });

  await t.test('audit INSERT failure rolls membership and session revocation back',async()=>{
    const f=await seed(),admin=await staff.issueForVerifiedIdentity({
      storeId:f.storeId,userId:f.adminId});
    const target=await staff.issueForVerifiedIdentity({
      storeId:f.storeId,userId:f.managerId});
    await pool.query(`CREATE OR REPLACE FUNCTION pos025_fail_member_audit()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='STAFF_MEMBERSHIP_UPDATED' THEN
        RAISE EXCEPTION 'synthetic audit rollback';
      END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER pos025_audit_fail BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION pos025_fail_member_audit()`);
    try {
      await assert.rejects(()=>staff.changeMember(admin.token,f.managerId,{
        role:'CASHIER',active:false,reason:'Must rollback on failed audit insert',
      }),forbidden('DATABASE_UNAVAILABLE'));
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS pos025_audit_fail ON audit_logs');
      await pool.query('DROP FUNCTION IF EXISTS pos025_fail_member_audit()');
    }
    assert.equal((await staff.resolve(target.token)).role,'MANAGER');
    assert.equal(await count(f.storeId,'STAFF_MEMBERSHIP_UPDATED'),0);
    const state=await pool.query<{role:string;active:boolean}>(`
      SELECT role,active FROM store_memberships WHERE store_id=$1 AND user_id=$2`,
      [f.storeId,f.managerId]);
    assert.deepEqual(state.rows[0],{role:'MANAGER',active:true});
  });

  await t.test('opt-in existing conflict route checks actual token role; default denies',async t2=>{
    const f=await seed(),manager=await staff.issueForVerifiedIdentity({
      storeId:f.storeId,userId:f.managerId}),
      cashier=await staff.issueForVerifiedIdentity({storeId:f.storeId,userId:f.cashierId});
    let calls=0;
    const app=buildServer({conflictReview:{
      resolvePrincipal:createStaffPrincipalResolver(staff),
      service:{
        list:async actor=>{calls++;assert.equal(actor.userId,f.managerId);return [];},
        get:async()=>{throw Error('not called');},
        resolve:async()=>{throw Error('not called');},
      },
    }});
    t2.after(()=>app.close());
    const get=(token:string)=>app.inject({method:'GET',
      url:'/v1/sync/conflicts',headers:{authorization:'Bearer '+token,
        'x-role':'ADMIN','x-user-id':f.adminId}});
    assert.equal((await get(cashier.token)).statusCode,403);
    assert.equal((await get(manager.token)).statusCode,200);
    assert.equal(calls,1);
    await pool.query('UPDATE users SET active=false WHERE id=$1',[f.managerId]);
    assert.equal((await get(manager.token)).statusCode,401);
    assert.equal(calls,1);
  });
});
