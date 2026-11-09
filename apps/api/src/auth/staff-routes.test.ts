import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../server.js';
import {bearerFromAuthorization,StaffAuthError,
  type StaffPrincipal} from './staff-sessions.js';
import {createStaffPrincipalResolver} from './staff-routes.js';

const id=()=>randomUUID();
const actor:StaffPrincipal={
  sessionId:id(),userId:id(),storeId:id(),role:'ADMIN',
};
const token='A'.repeat(43);

test('POS-025 normal Fastify keeps staff/login and privileged routes 404 (spoofed headers ignored)',async t=>{
  const app=buildServer();
  t.after(()=>app.close());
  const requests=[
    ['GET','/v1/staff/me'],
    ['POST','/v1/staff/logout'],
    ['PATCH','/v1/staff/members/'+id()],
    ['POST','/v1/staff/login'],
    ['GET','/v1/catalog/products'],
    ['GET','/v1/sync/conflicts'],
  ] as const;
  for(const [method,url] of requests){
    const result=await app.inject({
      method,url,headers:{
        'authorization':'Bearer '+token,
        'x-role':'ADMIN','x-store-id':actor.storeId,'x-user-id':actor.userId,
      },...(method==='PATCH'?{payload:{role:'ADMIN',active:true,
        reason:'A forged staff change attempt'}}:{}),
    });
    assert.equal(result.statusCode,404,method+' '+url);
  }
});

test('POS-025 strict bearer parser never accepts fake roles/headers/weak tokens',()=>{
  assert.equal(bearerFromAuthorization('Bearer '+token),token);
  for(const bad of [undefined,null,'',token,'bearer '+token,
    'Bearer '+token+' extra','Bearer '+ 'A'.repeat(42), 'Basic '+token])
    assert.throws(()=>bearerFromAuthorization(bad),
      (error:unknown)=>error instanceof StaffAuthError&&error.code==='UNAUTHORIZED');
});

test('POS-025 staff routes use resolved session identity; no client-supplied role',async t=>{
  let logged=true, role:StaffPrincipal['role']='ADMIN',calls=0;
  const service={
    resolve:async (received:unknown):Promise<StaffPrincipal>=>{
      calls++;
      assert.equal(received,token);
      if(!logged)throw new StaffAuthError('UNAUTHORIZED',401);
      return {...actor,role};
    },
    revokeOwn:async (received:unknown)=>{
      assert.equal(received,token);logged=false;return {revoked:true};
    },
    changeMember:async(_token:unknown,target:unknown,raw:unknown)=>{
      assert.equal(target,actor.userId);
      assert.deepEqual(raw,{role:'CASHIER',active:false,reason:'Authorized member update'});
      return {userId:actor.userId,storeId:actor.storeId,
        role:'CASHIER' as const,active:false,changed:true,revokedSessions:1};
    },
  };
  const app=buildServer({staff:{service}});
  t.after(()=>app.close());
  const request=(method:'GET'|'POST'|'PATCH',url:string,payload?:Record<string,unknown>,
    headers:Record<string,string>={'authorization':'Bearer '+token})=>app.inject({
      method,url,headers,...(payload?{payload}:{}),
    });
  assert.equal((await request('GET','/v1/staff/me',undefined,{'x-role':'ADMIN'})).statusCode,401);
  const me=await request('GET','/v1/staff/me');
  assert.equal(me.statusCode,200);
  assert.deepEqual(me.json(),actor);
  const target='/v1/staff/members/'+actor.userId;
  role='MANAGER';
  assert.equal((await request('PATCH',target,{
    role:'ADMIN',active:true,reason:'This must be rejected',
  })).statusCode,403);
  role='CASHIER';
  assert.equal((await request('PATCH',target,{
    role:'ADMIN',active:true,reason:'Also reject cashier',
  })).statusCode,403);
  role='ADMIN';
  assert.equal((await request('PATCH','/v1/staff/members/nope',{
    role:'CASHIER',active:false,reason:'Authorized member update',
  })).statusCode,400);
  assert.equal((await request('PATCH',target,{
    role:'CASHIER',active:false,reason:'Authorized member update',
  })).statusCode,200);
  assert.equal((await request('POST','/v1/staff/logout')).statusCode,200);
  assert.equal((await request('GET','/v1/staff/me')).statusCode,401);
  assert.ok(calls>=5);
});

test('POS-025 principal resolver derives role from live service, fails closed',async()=>{
  let role:StaffPrincipal['role']='MANAGER';
  const resolver=createStaffPrincipalResolver({
    resolve:async received=>{
      assert.equal(received,token);return {...actor,role};
    },
  });
  const fromHeaders=(authorization?:string)=>({headers:{authorization}}) as never;
  assert.deepEqual(await resolver(fromHeaders('Bearer '+token)),{
    userId:actor.userId,storeId:actor.storeId,role:'MANAGER',
  });
  role='CASHIER';
  assert.equal((await resolver(fromHeaders('Bearer '+token)))?.role,'CASHIER');
  assert.equal(await resolver(fromHeaders('Bearer NOT_A_SESSION')),null);
});
