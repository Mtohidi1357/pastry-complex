import { z } from "zod";
import { showFinishedQuery } from "@/lib/listVisibility";
const line = z.object({ productId: z.uuid(), quantity: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/) }).strict();
export const createDeliveryBody = z.object({ clientRequestId: z.uuid(), destinationBranchId: z.uuid(), sourceRequestId: z.uuid().optional(), businessDate: z.string(), note: z.string().trim().min(5).max(1000), lines: z.array(line).min(1).max(200) }).strict();
export const deliveryActionBody = z.object({ version: z.number().int().positive(), clientRequestId: z.uuid(), reason: z.string().trim().min(5).max(1000), lines: z.array(line).min(1).max(200).optional() }).strict();
export const deliveryLeaseBody = z.object({ action: z.enum(["acquire", "renew", "release"]), token: z.uuid() }).strict();
export const deliveryQuery = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1), showFinished: showFinishedQuery, reference: z.string().trim().max(14).optional() }).strict();
export type CreateDelivery = z.infer<typeof createDeliveryBody>;
export type DeliveryAction = z.infer<typeof deliveryActionBody>;
