import type { Prisma } from "@/generated/prisma/client";
import { amount, invalid, minor } from "./stockValidation";

type Posting = { id: string; branchId: string; businessDate: Date; note: string | null; sourceType: string;
    lines: { productId: string; quantity: string }[] };
// Internal transactional operation, not an API. Caller authorizes the actor and
// locks the branch before request/receipt rows. Never start a nested transaction.
export async function postReceiptToStock(tx: Prisma.TransactionClient, receipt: Posting, actorId: string, now: Date) {
    if (!receipt.lines.length || new Set(receipt.lines.map(line => line.productId)).size !== receipt.lines.length) invalid("Receipt posting requires distinct positive product rows.", 409);
    const prefix = receipt.sourceType === "REQUEST_RECEIVING" ? "request" : "manual";
    for (const line of [...receipt.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const quantity = minor(line.quantity);
        if (quantity <= BigInt(0)) invalid("Receipt posting quantities must be positive.", 409);
        const key = { branchId: receipt.branchId, productId: line.productId };
        const current = await tx.branchStockBalance.findUnique({ where: { branchId_productId: key } });
        const next = minor(current?.quantity.toString() ?? "0") + quantity;
        if (next > BigInt("999999999999999999")) invalid("Stock balance exceeds its supported range.", 409);
        await tx.branchStockBalance.upsert({ where: { branchId_productId: key }, create: { ...key, quantity: amount(next), revision: 1 }, update: { quantity: amount(next), revision: { increment: 1 } } });
        await tx.stockMovement.create({ data: { ...key, receiptId: receipt.id, sourceKey: `${prefix}:${receipt.id}:${line.productId}:receive`, kind: "RECEIPT", quantityDelta: line.quantity, businessDate: receipt.businessDate, actorId, postedAt: now, reason: receipt.note } });
    }
}
