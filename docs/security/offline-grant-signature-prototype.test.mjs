import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 verifyOfflineGrantSignaturePrototype,OFFLINE_GRANT_PROTOTYPE_MAX_SECONDS,
} from './offline-grant-signature-prototype.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const {publicKey:foreignKey}=generateKeyPairSync('ed25519');
const roots=new Map([['test-pinned-v1',publicKey]]);
const at=Date.parse('2026-11-09T09:00:00.000Z')/1000;
const head=()=>({alg:'EdDSA',typ:'smartpos-offline-grant-v1',kid:'test-pinned-v1'});
const body=()=>({
 version:1,issuer:'smartpos-api',audience:'smartpos-desktop-offline',
 grantId:randomUUID(),storeId:randomUUID(),deviceId:randomUUID(),
 deviceKeySha256:'a'.repeat(64),cashierId:randomUUID(),
 serverSessionId:randomUUID(),shiftId:randomUUID(),role:'CASHIER',
 operation:'offline:cash_checkout',issuedAt:at,notBefore:at,
 expiresAt:at+OFFLINE_GRANT_PROTOTYPE_MAX_SECONDS,
 shiftExpiresAt:at+OFFLINE_GRANT_PROTOTYPE_MAX_SECONDS,
 nonce:randomBytes(16).toString('base64url'),
});
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function signed(claims=body(),header=head(),key=privateKey){
 const payload=enc(header)+'.'+enc(claims);
 return payload+'.'+sign(null,Buffer.from(payload,'ascii'),key).toString('base64url');
}
const deny=(raw,keys=roots)=>assert.throws(
 ()=>verifyOfflineGrantSignaturePrototype(raw,keys),
 error=>error?.message==='SEC013_UNTRUSTED_GRANT',
);
test('SEC-013A valid server signature only — does not authorize checkout',()=>{
 const c=body(),grant=verifyOfflineGrantSignaturePrototype(signed(c),roots);
 assert.equal(grant.claims.grantId,c.grantId);
 assert.equal(grant.claims.expiresAt-c.issuedAt,14_400);
 assert.equal(grant.signatureVerified,true);
 assert.equal(Object.isFrozen(grant.claims),true);
 assert.equal('authorizedToCheckout' in grant,false);
});
test('reject unsigned, unpinned keys, tampering, noncanonical signature',()=>{
 const token=signed(),[h,p,s]=token.split('.');
 deny(h+'.'+p);deny(h+'.'+p+'.');
 deny(token,new Map([['test-pinned-v1',foreignKey]]));
 deny(signed(body(),{...head(),kid:'unknown'}));
 deny(h+'.'+enc({...body(),deviceId:randomUUID()})+'.'+s);
 deny(h+'.'+p+'.'+Buffer.alloc(64).toString('base64url'));
 deny(h+'.'+p+'.'+s+'=');deny(h+'.'+p+'.'+s+'.x');
});
test('reject algorithm/type confusion and extra header',()=>{
 deny(signed(body(),{...head(),alg:'HS256'}));
 deny(signed(body(),{...head(),typ:'JWT'}));
 deny(signed(body(),{...head(),x:'unexpected'}));
 deny(signed(),new Map());
 deny(signed(),new Map([['test-pinned-v1',privateKey]]));
});
test('reject excessive duration, malformed identities, claims and permission',()=>{
 const wrong=[
  {expiresAt:at+14_401},{expiresAt:at},{issuedAt:at+60},
  {notBefore:at-1},{notBefore:at+14_400},
  {role:'MANAGER'},{operation:'inventory:adjust'},{version:2},
  {issuer:'attacker'},{audience:'other'},{deviceKeySha256:'abc'},
  {nonce:'aa'},{shiftExpiresAt:at},{cashierId:'forged'},
  {expiresAt:String(at+3600)},{extra:'unknown'},
 ];
 for(const patch of wrong)deny(signed({...body(),...patch}));
});
test('reject signed duplicate JSON keys, whitespace and noncanonical payload',()=>{
 const h=enc(head()),c=body(),data=JSON.stringify(c);
 for(const plain of [
  data.replace('"version":1','"version":1,"version":1'),
  ' '+data, data.replace('"role":"CASHIER"','"role": "CASHIER"'),
 ]){
  const msg=h+'.'+Buffer.from(plain).toString('base64url');
  const sig=sign(null,Buffer.from(msg,'ascii'),privateKey).toString('base64url');
  deny(msg+'.'+sig);
 }
});
test('SEC-013A prototype is not wired into cash or production HTTP',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const runtime=[
  '../../apps/desktop/src/main/index.ts',
  '../../apps/desktop/src/preload/index.ts',
  '../../apps/desktop/src/renderer/src/app.tsx',
  '../../apps/api/src/main.ts',
 ];
 for(const p of runtime)
  assert.doesNotMatch(read(p),/offline-grant-signature-prototype|verifyOfflineGrantSignaturePrototype/);
 assert.match(read('../../apps/desktop/src/main/index.ts'),/mode: 'DEMO_ONLY'/);
 assert.match(read('../../apps/api/src/main.ts'),/buildServer\(\{ logger: true \}\)/);
});
