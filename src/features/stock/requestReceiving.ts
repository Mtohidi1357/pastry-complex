import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { amount, invalid } from "./stockValidation";
import { postReceiptToStock } from "./stockPosting";

type Request = { id: string; status: string; deletedAt: Date | null; assignedToId: string | null; branchId: string; businessDate: Date;
    lines: { productId: string; receivedQty: number | null }[] };
export async function postRequestReceiving(tx: Prisma.TransactionClient, request: Request, user: CurrentUser, now: Date) {
    if (user.roleCode !== "BM" || request.assignedToId !== user.id || request.branchId !== user.branchId || request.deletedAt) {
        throw new PermissionDeniedError("Only the assigned branch manager can confirm request receiving.");
    }
    if (request.status !== "COMPLETED") invalid("Only a completed request can post final receiving.", 409);
    const actor = await tx.user.findFirst({ where: { id: user.id, branchId: request.branchId, isActive: true, role: { is: { code: "BM" } } }, select: { id: true } });
    const branch = await tx.branch.findUnique({ where: { id: request.branchId }, select: { isActive: true, type: true } });
    if (!actor || !branch?.isActive || branch.type !== "SALES") throw new PermissionDeniedError("An active manager and sales branch are required.");
    if (await tx.stockReceipt.findUnique({ where: { sourceRequestId: request.id } })) {
        invalid("This request already has a stock receipt. No additional stock was posted.", 409);
    }
    if (!request.lines.length) invalid("A request without product lines cannot post stock.", 409);
    const lines: { productId: string; quantity: string }[] = [];
    for (const line of request.lines) {
        const quantity = line.receivedQty;
        if (quantity === null || !Number.isSafeInteger(quantity) || quantity < 0) invalid("Save a non-negative received quantity for every request line before closing.", 409);
        if (quantity > 0) lines.push({ productId: line.productId, quantity: amount(BigInt(quantity) * BigInt(1000)) });
    }
    if (!lines.length) invalid("At least one received quantity must be greater than zero before closing.", 409);
    if (new Set(lines.map(line => line.productId)).size !== lines.length) invalid("The request has duplicate product rows.", 409);
    const products = await tx.product.findMany({ where: { id: { in: lines.map(line => line.productId) }, isActive: true }, select: { id: true } });
    if (products.length !== lines.length) invalid("Received products must be active before stock can be posted.", 409);
    const receipt = await tx.stockReceipt.create({ data: {
        clientRequestId: `request:${request.id}`, createHash: createHash("sha256").update(`request:${request.id}`).digest("hex"),
        sourceType: "REQUEST_RECEIVING", sourceRequestId: request.id, branchId: request.branchId,
        businessDate: request.businessDate, status: "CONFIRMED", createdById: user.id, confirmedById: user.id,
        confirmedAt: now, note: `Final receiving for request ${request.id}.`, lines: { create: lines },
    } });
    await postReceiptToStock(tx, { ...receipt, lines }, user.id, now);
    return receipt.id;
}
