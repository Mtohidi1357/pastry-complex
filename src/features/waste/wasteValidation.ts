import { z } from "zod";
import { showFinishedQuery } from "@/lib/listVisibility";
export const wasteBody = z.object({
    businessDate: z.string(), note: z.string().trim().min(5).max(1000),
    lines: z.array(z.object({ productId: z.uuid(), quantity: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/),
        reason: z.enum(["EXPIRED", "DAMAGED", "SPOILED", "OTHER"]), note: z.string().trim().max(1000).default("") }).strict()).min(1).max(200),
}).strict();
export const createWasteBody = wasteBody.extend({ clientRequestId: z.uuid() });
export const saveWasteBody = wasteBody.extend({ version: z.number().int().positive() });
export const wasteActionBody = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(5).max(1000) }).strict();
export const wasteQuery = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1), showFinished: showFinishedQuery,
    branchId: z.uuid().optional(), tasks: showFinishedQuery, reference: z.string().trim().max(14).optional() }).strict();
export type WasteInput = z.infer<typeof wasteBody>;
