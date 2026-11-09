import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { z } from 'zod';
import type { CatalogPrincipal, CatalogRole } from '../catalog/service.js';

/**
 * POS-025 online server-side staff sessions (INTERNAL ONLY).
 * A verified subject MUST originate from a reviewed online identity provider,
 * NEVER request JSON, x-user headers, or a static test principal in main.ts.
 * This does NOT implement password/Argon2id login, offline device keys or grants.
 * Bearers exist only in the trusted issuer return value; PostgreSQL stores a SHA-256
 * digest of 256 random bits, and audits never contain bearer material.
 */
const uuid = z.uuid();
const roleSchema = z.enum(['ADMIN','MANAGER','CASHIER']);
const identitySchema = z.strictObject({storeId: uuid, userId: uuid});
const mutationSchema = z.strictObject({
  role: roleSchema,
  active: z.boolean(),
  reason: z.string().trim().min(12).max(500),
});
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const hash = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const STAFF_MAX_SESSION_SECONDS = 900; // online access only; NOT a 4h offline grant
export type VerifiedOnlineIdentity = Readonly<{storeId: string; userId: string}>;
export type StaffPrincipal = CatalogPrincipal & Readonly<{sessionId: string}>;
export type IssuedStaffSession = Readonly<{
  sessionId: string; token: string; expiresAt: string; storeId: string; userId: string;
}>;
export type StaffMembershipChange = Readonly<{
  userId: string; storeId: string; role: CatalogRole; active: boolean;
  changed: boolean; revokedSessions: number;
}>;
export type StaffErrorCode = 'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|
  'LAST_ADMIN'|'DATABASE_UNAVAILABLE';
export class StaffAuthError extends Error {
  constructor(readonly code: StaffErrorCode, readonly httpStatus: number) {
    super(code);
    this.name = 'StaffAuthError';
  }
}
type SubjectRow = QueryResultRow & {
  role: string; active: boolean;
};
type SessionRow = QueryResultRow & {
  id: string; store_id: string; user_id: string; expires_at: Date; role: string;
};
type RevokeRow = QueryResultRow & {
  id: string; store_id: string; user_id: string;
};
type MemberRow = QueryResultRow & {role: string; active: boolean};
const unauth = (): never => {throw new StaffAuthError('UNAUTHORIZED',401);};
function safe(error: unknown): StaffAuthError | z.ZodError {
  if (error instanceof StaffAuthError || error instanceof z.ZodError) return error;
  return new StaffAuthError('DATABASE_UNAVAILABLE',503);
}
function parseBearer(token: unknown): string {
  if (typeof token !== 'string' || !TOKEN.test(token)) return unauth();
  return token;
}
/** Authorization is data, not a request-provided role. Always read live DB state. */
async function selectPrincipal(db: PoolClient, tokenHash: string,
  forShare = false): Promise<StaffPrincipal> {
  const result = await db.query<SessionRow>(`
    SELECT s.id,s.store_id,s.user_id,s.expires_at,m.role
    FROM staff_sessions s JOIN store_memberships m
      ON m.store_id=s.store_id AND m.user_id=s.user_id
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL
      AND s.expires_at>statement_timestamp()
      AND m.active=true AND u.active=true
      AND m.role IN ('ADMIN','MANAGER','CASHIER')
    ${forShare ? 'FOR SHARE OF s,m,u' : ''}
  `,[tokenHash]);
  const row = result.rows[0];
  if (!row || !roleSchema.safeParse(row.role).success) return unauth();
  return {sessionId:row.id,storeId:row.store_id,userId:row.user_id,
    role:roleSchema.parse(row.role)};
}
async function audit(db: PoolClient, actorId: string, storeId: string,
  action: string, entityType: string, entityId: string,
  metadata: Record<string,unknown>): Promise<void> {
  await db.query(`INSERT INTO audit_logs
    (id,store_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(),storeId,actorId,action,entityType,entityId,JSON.stringify(metadata)]);
}

export class StaffSessionService {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(fn:(db:PoolClient)=>Promise<T>):Promise<T> {
    let db:PoolClient;
    try { db=await this.pool.connect(); }
    catch {throw new StaffAuthError('DATABASE_UNAVAILABLE',503);}
    try {
      await db.query('BEGIN');
      const result=await fn(db);
      await db.query('COMMIT');
      return result;
    } catch(error) {
      try {await db.query('ROLLBACK');}catch{/* no credential leakage */}
      throw safe(error);
    } finally {db.release();}
  }

  /**
   * Only AFTER trusted upstream identity proof; no HTTP registration for issuance.
   * No password/login processing, refresh token, or offline authority here.
   * Constant 15-minute TTL, no caller-controlled issuer, role, or expiration.
   */
  async issueForVerifiedIdentity(raw: VerifiedOnlineIdentity):Promise<IssuedStaffSession> {
    const identity=identitySchema.parse(raw);
    return this.transaction(async db=>{
      const result=await db.query<SubjectRow>(`
        SELECT m.role,m.active FROM store_memberships m
        JOIN users u ON u.id=m.user_id
        WHERE m.store_id=$1 AND m.user_id=$2 AND m.active=true AND u.active=true
          AND m.role IN ('ADMIN','MANAGER','CASHIER')
        FOR SHARE OF m,u`,[identity.storeId,identity.userId]);
      if (result.rows.length!==1) return unauth();
      const token=randomBytes(32).toString('base64url');
      const sessionId=randomUUID();
      const inserted=await db.query<{expires_at:Date}>(`
        INSERT INTO staff_sessions
          (id,store_id,user_id,token_hash,issued_at,expires_at)
        VALUES($1,$2,$3,$4,statement_timestamp(),
          statement_timestamp()+interval '15 minutes')
        RETURNING expires_at`,
        [sessionId,identity.storeId,identity.userId,hash(token)]);
      if (!inserted.rows[0]) throw new StaffAuthError('DATABASE_UNAVAILABLE',503);
      await audit(db,identity.userId,identity.storeId,'STAFF_SESSION_ISSUED',
        'STAFF_SESSION',sessionId,{ttlSeconds:STAFF_MAX_SESSION_SECONDS});
      return {sessionId,token,expiresAt:inserted.rows[0].expires_at.toISOString(),
        storeId:identity.storeId,userId:identity.userId};
    });
  }

  /** No caching: each resolver call checks expiry/revocation and current membership. */
  async resolve(token: unknown):Promise<StaffPrincipal> {
    const valid=parseBearer(token);
    return this.transaction(async db=>selectPrincipal(db,hash(valid),true));
  }

  /** Log out self by the same opaque credential. Duplicate revoke adds no audit. */
  async revokeOwn(token: unknown):Promise<{revoked:boolean}> {
    const valid=parseBearer(token);
    return this.transaction(async db=>{
      const principal=await selectPrincipal(db,hash(valid),true);
      const rows=await db.query<RevokeRow>(`
        UPDATE staff_sessions SET revoked_at=statement_timestamp(),
          revoked_by=$2
        WHERE id=$1 AND revoked_at IS NULL
        RETURNING id,store_id,user_id`,[principal.sessionId,principal.userId]);
      if (!rows.rows[0]) return {revoked:false};
      await audit(db,principal.userId,principal.storeId,
        'STAFF_SESSION_REVOKED','STAFF_SESSION',principal.sessionId,{reason:'SELF_LOGOUT'});
      return {revoked:true};
    });
  }

  /**
   * Admin-only membership mutation. Locks are serialized per store to protect
   * the last active admin rule from concurrent demotions.
   * Revocation and audit are committed atomically, including self-demotion.
   * No other-store membership can be inferred via this endpoint.
   */
  async changeMember(adminToken: unknown, targetUserId: unknown,
    raw: unknown):Promise<StaffMembershipChange> {
    const token=parseBearer(adminToken), target=uuid.parse(targetUserId);
    const input=mutationSchema.parse(raw);
    return this.transaction(async db=>{
      const actor=await selectPrincipal(db,hash(token),true);
      if (actor.role!=='ADMIN') throw new StaffAuthError('FORBIDDEN',403);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,31))',
        ['smartpos:staff:'+actor.storeId]);
      const existing=await db.query<MemberRow>(`
        SELECT m.role,m.active FROM store_memberships m
        JOIN users u ON u.id=m.user_id
        WHERE m.store_id=$1 AND m.user_id=$2
        FOR UPDATE OF m`,[actor.storeId,target]);
      const before=existing.rows[0];
      if (!before) throw new StaffAuthError('NOT_FOUND',404);
      if (!roleSchema.safeParse(before.role).success)
        throw new StaffAuthError('FORBIDDEN',403);
      if (before.role===input.role && before.active===input.active)
        return {userId:target,storeId:actor.storeId,role:input.role,
          active:input.active,changed:false,revokedSessions:0};
      if (before.role==='ADMIN' && before.active &&
          (input.role!=='ADMIN' || !input.active)) {
        const others=await db.query<{n:string}>(`
          SELECT count(*)::text AS n FROM store_memberships m
          JOIN users u ON u.id=m.user_id
          WHERE m.store_id=$1 AND m.user_id<>$2
            AND m.role='ADMIN' AND m.active=true AND u.active=true`,
          [actor.storeId,target]);
        if (BigInt(others.rows[0]?.n??'0')===0n)
          throw new StaffAuthError('LAST_ADMIN',409);
      }
      await db.query(`
        UPDATE store_memberships SET role=$3,active=$4
        WHERE store_id=$1 AND user_id=$2`,
        [actor.storeId,target,input.role,input.active]);
      const revoked=await db.query(`
        UPDATE staff_sessions SET revoked_at=statement_timestamp(),
          revoked_by=$3
        WHERE store_id=$1 AND user_id=$2 AND revoked_at IS NULL`,
        [actor.storeId,target,actor.userId]);
      await audit(db,actor.userId,actor.storeId,'STAFF_MEMBERSHIP_UPDATED',
        'STORE_MEMBERSHIP',target,{
          previousRole:before.role,previousActive:before.active,
          newRole:input.role,newActive:input.active,reason:input.reason,
          sessionsRevoked:revoked.rowCount??0,
        });
      return {userId:target,storeId:actor.storeId,
        role:input.role,active:input.active,changed:true,
        revokedSessions:revoked.rowCount??0};
    });
  }
}

/** Strict Authorization parser: never trust spoofed role/store/device headers. */
export function bearerFromAuthorization(authorization: unknown):string {
  if (typeof authorization!=='string')return unauth();
  const matched=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!matched?.[1])return unauth();
  return matched[1];
}
