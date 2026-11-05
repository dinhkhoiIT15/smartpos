import { z } from 'zod';

/**
 * PostgreSQL BIGINT max. JSON never carries VND as a number:
 * values must be canonical decimal strings to preserve all 64-bit integers.
 */
export const MAX_VND = 9_223_372_036_854_775_807n;
export const vndStringSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, 'VND must be a non-negative canonical decimal integer string')
  .refine((value) => /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= MAX_VND, 'VND exceeds signed PostgreSQL bigint limit');

export type VndString = z.infer<typeof vndStringSchema>;

/** A cart pricing input contract, NOT an authoritative completed sale or sync event. */
export const cartLineSchema = z.strictObject({
  variantId: z.uuid(),
  skuSnapshot: z.string().trim().min(1).max(64),
  nameSnapshot: z.string().trim().min(1).max(200),
  quantity: z.int().min(1),
  unitPriceVnd: vndStringSchema,
  discountVnd: vndStringSchema,
});
export type CartLineInput = z.infer<typeof cartLineSchema>;

export const cashCartEstimateSchema = z.strictObject({
  items: z.array(cartLineSchema).min(1).max(100),
  tenderedVnd: vndStringSchema,
});
export type CashCartEstimateInput = z.infer<typeof cashCartEstimateSchema>;

/** Never parse untrusted VND JSON with Number(); use BigInt after schema validation. */
export function parseVndString(input: unknown): bigint {
  return BigInt(vndStringSchema.parse(input));
}
