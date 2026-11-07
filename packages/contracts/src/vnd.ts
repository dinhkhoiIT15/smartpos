import { z } from 'zod';

/** Shared signed-BIGINT VND wire policy, independent of sync-v1 module. */
export const MAX_VND = 9_223_372_036_854_775_807n;
export const vndStringSchema = z.string()
  .regex(/^(0|[1-9][0-9]*)$/, 'VND must be a non-negative canonical decimal integer string')
  .max(19)
  .refine((value) => /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 19 &&
    BigInt(value) <= MAX_VND, 'VND exceeds signed PostgreSQL bigint limit');
export type VndString = z.infer<typeof vndStringSchema>;
/** Never parse untrusted JSON money via Number(). */
export function parseVndString(input: unknown): bigint {
  return BigInt(vndStringSchema.parse(input));
}
