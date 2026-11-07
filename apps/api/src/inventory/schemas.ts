import { z } from 'zod';

/**
 * Inventory quantity is signed PostgreSQL BIGINT, not JS number or VND.
 * Canonical decimal strings are required over JSON to avoid precision loss.
 */
export const MAX_QTY = 9_223_372_036_854_775_807n;
export const MIN_QTY = -9_223_372_036_854_775_808n;

export const quantityDeltaSchema = z.string()
  .regex(/^-?[1-9][0-9]*$/, 'quantity must be a nonzero canonical signed integer string')
  .refine(
    (value) => /^-?[1-9][0-9]*$/.test(value) &&
      BigInt(value) >= MIN_QTY && BigInt(value) <= MAX_QTY,
    'quantity is outside signed BIGINT range',
  );

export const manualMovementKindSchema = z.enum(['RECEIPT', 'ISSUE', 'CORRECTION']);

export const adjustInventorySchema = z.strictObject({
  movementId: z.uuid(), // stable idempotency key on each manual adjustment
  variantId: z.uuid(),
  deltaQty: quantityDeltaSchema,
  kind: manualMovementKindSchema,
  reason: z.string().trim().min(5).max(240),
}).superRefine((input, ctx) => {
  // Zod may evaluate this refinement after an earlier regex failure.
  // Never call BigInt on malformed untrusted strings.
  if (!/^-?[1-9][0-9]*$/.test(input.deltaQty)) return;
  const delta = BigInt(input.deltaQty);
  if (input.kind === 'RECEIPT' && delta <= 0n) {
    ctx.addIssue({ code: 'custom', path: ['deltaQty'], message: 'receipt requires positive quantity' });
  } else if (input.kind === 'ISSUE' && delta >= 0n) {
    ctx.addIssue({ code: 'custom', path: ['deltaQty'], message: 'issue requires negative quantity' });
  }
});

export const inventoryHistoryQuerySchema = z.strictObject({
  limit: z.union([z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number), z.number().int()])
    .pipe(z.number().int().min(1).max(100)).optional().default(20),
});

export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
