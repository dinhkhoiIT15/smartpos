import { z } from 'zod';
import { vndStringSchema } from './vnd.js';
export { MAX_VND, vndStringSchema, parseVndString } from './vnd.js';
export type { VndString } from './vnd.js';

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

// POS-016 sync wire contract; transport/handlers are NOT enabled by exporting schemas.
export * from './sync-v1.js';
