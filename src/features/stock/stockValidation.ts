import { z } from "zod";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
export function invalid(message: string, status = 400): never { throw new AppError(ApiErrorCode.VALIDATION_ERROR, message, status); }
export function minor(value: string): bigint {
    const match = /^(\d{1,15})(?:\.(\d{1,3}))?$/.exec(value);
    if (!match) return invalid("Invalid stock quantity.");
    return BigInt(match[1]) * BigInt(1000) + BigInt((match[2] ?? "").padEnd(3, "0"));
}
export function amount(value: bigint): string {
    const sign = value < BigInt(0) ? "-" : "";
    const absolute = value < BigInt(0) ? -value : value;
    return `${sign}${absolute / BigInt(1000)}.${String(absolute % BigInt(1000)).padStart(3, "0")}`;
}
export function businessDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid("Invalid business date.");
    const date = new Date(value + "T00:00:00.000Z");
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return invalid("Invalid business date.");
    return date;
}
export const receiptBody = z.object({
    businessDate: z.string(), note: z.string().trim().max(1000).default(""),
    lines: z.array(z.object({ productId: z.uuid(), quantity: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/) }).strict()).min(1).max(200),
}).strict();
export const createReceiptBody = receiptBody.extend({ clientRequestId: z.uuid() });
export const saveReceiptBody = receiptBody.extend({ version: z.number().int().positive() });
export const confirmReceiptBody = z.object({ version: z.number().int().positive() }).strict();
export const reverseReceiptBody = confirmReceiptBody.extend({ reason: z.string().trim().min(5).max(1000) });
export const stockQuery = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1), branchId: z.uuid().optional(), productId: z.uuid().optional(), sourceType: z.enum(["MANUAL_RECEIPT", "REQUEST_RECEIVING"]).optional() }).strict();
export type ReceiptInput = z.infer<typeof receiptBody>;
