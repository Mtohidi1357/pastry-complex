import { showFinishedQuery } from "@/lib/listVisibility";
import { z } from "zod";
export const countQuery = z.object({ showFinished: showFinishedQuery, page: z.coerce.number().int().min(1).max(100_000).default(1), branchId: z.uuid().optional() }).strict();
export const startCountBody = z.object({ clientRequestId: z.uuid(), kind: z.enum(["OPENING", "COUNT"]), businessDate: z.string(), productIds: z.array(z.uuid()).min(1).max(200) }).strict();
export const saveCountBody = z.object({ version: z.number().int().positive(), note: z.string().trim().max(1000), lines: z.array(z.object({ productId: z.uuid(), countedQuantity: z.string().regex(/^\d{1,15}(?:\.\d{1,3})?$/) }).strict()).min(1).max(200) }).strict();
export const countVersionBody = z.object({ version: z.number().int().positive() }).strict();
export const countDecisionBody = countVersionBody.extend({ reason: z.string().trim().min(5).max(1000) });
export type StartCountInput = z.infer<typeof startCountBody>;
export type SaveCountInput = z.infer<typeof saveCountBody>;
