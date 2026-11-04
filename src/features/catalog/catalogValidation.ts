import { z } from "zod";
const fields = {
    code: z.string().trim().min(1).max(191), name: z.string().trim().min(1).max(191), displayName: z.string().trim().min(1).max(191),
    categoryId: z.uuid(), unit: z.enum(["PCS", "KG", "GR", "LITER", "BOX"]),
    barcode: z.string().trim().max(191).default(""), notes: z.string().trim().max(191).default(""),
    productionOrder: z.number().int().min(0).max(1_000_000), sortOrder: z.number().int().min(0).max(1_000_000), isActive: z.boolean(),
};
export const createProductBody = z.object({ ...fields, code: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/).transform(value => value.toUpperCase()) }).strict();
export const updateProductBody = z.object({ ...fields, version: z.number().int().positive() }).strict();
export const imageVersionBody = z.object({ version: z.number().int().positive() }).strict();
export const categoryBody = z.object({ code: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/).transform(value => value.toUpperCase()), name: z.string().trim().min(1).max(191), displayName: z.string().trim().min(1).max(191) }).strict();
export const catalogQuery = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1), categoryId: z.uuid().optional(), q: z.string().trim().max(100).optional(), includeInactive: z.enum(["true", "false"]).transform(value => value === "true").optional() }).strict();
export type ProductInput = z.infer<typeof createProductBody>;
