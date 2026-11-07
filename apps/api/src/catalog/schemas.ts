import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * POS-014 API-only catalog schemas. This is NOT a payment or offline sync DTO.
 * The future POS-016 contracts will handle the versioned external sync wire.
 */
export const MAX_CATALOG_VND = 9_223_372_036_854_775_807n;
export const uuidSchema = z.uuid();
const name = z.string().trim().min(1).max(200);
const canonicalNonnegativeInt64 = z.string()
  .regex(/^(0|[1-9][0-9]*)$/, 'must be a canonical integer string')
  .refine((value) => BigInt(value) <= MAX_CATALOG_VND, 'exceeds signed bigint range');

export const catalogPriceSchema = canonicalNonnegativeInt64;

/** SKU is normalized to uppercase, making 'sku-a' and 'SKU-A' identical. */
export const skuSchema = z.string().trim().min(1).max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/, 'invalid SKU'));

const attributeValue = z.string().trim().min(1).max(64);
export const variantAttributesSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'invalid attribute name'),
  attributeValue,
).refine((attributes) => Object.keys(attributes).length <= 8, 'at most 8 attributes')
 .transform((attributes) => Object.fromEntries(Object.entries(attributes)
  .sort(([a], [b]) => a.localeCompare(b, 'en'))
  .map(([key, value]) => [key, value.normalize('NFC')])));

export type VariantAttributes = z.infer<typeof variantAttributesSchema>;

export function variantAttributesKey(attributes: VariantAttributes): string {
  const entries = Object.entries(attributes)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, value]) => [key, value.trim().normalize('NFC').toLowerCase()]);
  // Stable and bounded: deterministic attributes, case-insensitive values.
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

export const createCategorySchema = z.strictObject({ name });
export const updateCategorySchema = createCategorySchema;
export const createBrandSchema = z.strictObject({ name });
export const updateBrandSchema = createBrandSchema;

export const createProductSchema = z.strictObject({
  categoryId: uuidSchema,
  brandId: uuidSchema,
  name,
});

export const updateProductSchema = z.strictObject({
  name: name.optional(),
  active: z.boolean().optional(),
}).refine((input) => Object.keys(input).length > 0, 'empty product update');

export const createVariantSchema = z.strictObject({
  productId: uuidSchema,
  sku: skuSchema,
  attributes: variantAttributesSchema,
  priceVnd: catalogPriceSchema,
});

export const updateVariantSchema = z.strictObject({
  expectedRevision: canonicalNonnegativeInt64,
  priceVnd: catalogPriceSchema.optional(),
  attributes: variantAttributesSchema.optional(),
  active: z.boolean().optional(),
}).refine(
  (input) => input.priceVnd !== undefined || input.attributes !== undefined || input.active !== undefined,
  'empty variant update',
);

export const listCatalogSchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().int().min(1).max(99)).optional().default(20),
  offset: z.string().regex(/^(0|[1-9][0-9]{0,4})$/).transform(Number).pipe(z.number().int().min(0).max(10000)).optional().default(0),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ListCatalogInput = z.infer<typeof listCatalogSchema>;
