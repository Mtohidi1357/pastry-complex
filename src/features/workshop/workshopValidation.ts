import { z } from "zod";
import { showFinishedQuery } from "@/lib/listVisibility";
export const workshopBody = z.object({ sourceType: z.enum(["MANUAL_PRODUCTION", "OPENING_STOCK"]), businessDate: z.string(), note: z.string().trim().min(5).max(1000),
    lines: z.array(z.object({ productId: z.uuid(), quantity: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/) }).strict()).min(1).max(200) }).strict();
export const createWorkshopBody = workshopBody.extend({ clientRequestId: z.uuid() });
export const saveWorkshopBody = workshopBody.extend({ version: z.number().int().positive() });
export const workshopActionBody = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(5).max(1000) }).strict();
export const workshopQuery = z.object({ view: z.enum(["receipts", "balances", "movements"]).default("balances"), page: z.coerce.number().int().min(1).max(100_000).default(1), showFinished: showFinishedQuery,
    branchId: z.uuid().optional(), productId: z.uuid().optional(), sourceType: z.enum(["MANUAL_PRODUCTION", "REQUEST_PRODUCTION", "OPENING_STOCK"]).optional(), reference: z.string().trim().max(14).optional() }).strict();
export type WorkshopInput = z.infer<typeof workshopBody>;
