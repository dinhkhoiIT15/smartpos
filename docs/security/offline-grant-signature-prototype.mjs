import { verify as verifySignature } from 'node:crypto';

/**
 * SEC-013A — UNWIRED, DESIGN-REVIEW PROTOTYPE ONLY.
 * This checks a server Ed25519 signature and claim STRUCTURE, NOT permission
 * to make a cash sale. No OS device-key possession, protected clock, login,
 * shift authorization, provisioning, revocation or trusted-key bootstrap.
 * NEVER import into Electron/API production entrypoints or a payment flow.
 */
export const OFFLINE_GRANT_PROTOTYPE_MAX_SECONDS = 14_400;
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX=/^[0-9a-f]{64}$/;
const KID=/^[A-Za-z0-9._-]{1,64}$/;
const B64URL=/^[A-Za-z0-9_-]+$/;
const HEADER_KEYS=['alg','typ','kid'];
const CLAIM_KEYS=[
 'version','issuer','audience','grantId','storeId','deviceId','deviceKeySha256',
 'cashierId','serverSessionId','shiftId','role','operation','issuedAt',
 'notBefore','expiresAt','shiftExpiresAt','nonce',
];
function reject(){throw new Error('SEC013_UNTRUSTED_GRANT');}
function exact(input,keys){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).length!==keys.length||
    Object.keys(input).some(k=>!keys.includes(k)))reject();
 return input;
}
function decode(segment,max){
 if(typeof segment!=='string'||!segment||segment.length>max*2||
    !B64URL.test(segment))reject();
 const bytes=Buffer.from(segment,'base64url');
 if(!bytes.length||bytes.length>max||bytes.toString('base64url')!==segment)reject();
 return bytes;
}
function canonicalJson(bytes,keys){
 const string=bytes.toString('utf8');
 if(!Buffer.from(string,'utf8').equals(bytes))reject();
 let data;
 try{data=JSON.parse(string);}catch{reject();}
 exact(data,keys);
 // Re-encoding catches duplicate keys, whitespace and alternative encodings.
 if(JSON.stringify(data)!==string)reject();
 return data;
}
function seconds(x){return typeof x==='number'&&Number.isSafeInteger(x)&&x>0;}
/**
 * Pinned verification keys MUST be trusted independently of the token.
 * The result has no checkout-authorization flag. Only proposed JWS syntax.
 */
export function verifyOfflineGrantSignaturePrototype(token,keys){
 if(typeof token!=='string'||token.length>4096||!(keys instanceof Map))reject();
 const parts=token.split('.');
 if(parts.length!==3)reject();
 const [rawHeader,rawClaims,rawSig]=parts;
 const header=canonicalJson(decode(rawHeader,256),HEADER_KEYS);
 if(header.alg!=='EdDSA'||header.typ!=='smartpos-offline-grant-v1'||
    typeof header.kid!=='string'||!KID.test(header.kid)||!keys.has(header.kid))reject();
 const key=keys.get(header.kid);
 if(!key||key.type!=='public'||key.asymmetricKeyType!=='ed25519')reject();
 const sig=decode(rawSig,64);
 if(sig.length!==64)reject();
 let verified=false;
 try{verified=verifySignature(null,Buffer.from(rawHeader+'.'+rawClaims,'ascii'),key,sig);}
 catch{reject();}
 if(!verified)reject();
 const c=canonicalJson(decode(rawClaims,2048),CLAIM_KEYS);
 if(c.version!==1||c.issuer!=='smartpos-api'||
    c.audience!=='smartpos-desktop-offline'||c.role!=='CASHIER'||
    c.operation!=='offline:cash_checkout')reject();
 for(const id of ['grantId','storeId','deviceId','cashierId','serverSessionId','shiftId'])
  if(typeof c[id]!=='string'||!UUID_V4.test(c[id]))reject();
 if(typeof c.deviceKeySha256!=='string'||!HEX.test(c.deviceKeySha256))reject();
 if(typeof c.nonce!=='string'||!B64URL.test(c.nonce)||
    decode(c.nonce,32).length!==16)reject();
 if(![c.issuedAt,c.notBefore,c.expiresAt,c.shiftExpiresAt].every(seconds))reject();
 if(c.notBefore<c.issuedAt||c.notBefore>=c.expiresAt||
    c.expiresAt<=c.issuedAt||
    c.expiresAt-c.issuedAt>OFFLINE_GRANT_PROTOTYPE_MAX_SECONDS||
    c.shiftExpiresAt<=c.issuedAt)reject();
 return Object.freeze({signatureVerified:true,claims:Object.freeze(c)});
}
