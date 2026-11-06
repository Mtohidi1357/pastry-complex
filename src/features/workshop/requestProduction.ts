import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { amount, invalid } from "../stock/stockValidation";
import { trackingCode } from "@/lib/trackingCode";
import { workshopActor } from "./workshopPolicy";
import { postWorkshopStock } from "./workshopPosting";
import { workshopEvent } from "./workshopService";
type ProductionRequest = { id: string; trackingNumber?: number; branchId: string; status: string; deletedAt: Date | null; assignedToId: string | null; lines: { productId: string; producedQty: number | null }[] };
// Transition guard holds the user's BAKERY branch lock, then the daily-request row lock.
export async function postRequestProduction(tx: Prisma.TransactionClient, request: ProductionRequest, user: CurrentUser, now: Date) {
    if (user.roleCode !== "WM" || request.assignedToId !== user.id || request.deletedAt) throw new PermissionDeniedError("Only the assigned workshop manager can book completed production.");
    await workshopActor(tx, user, true);
    if (request.status !== "WORKSHOP_PROCESSING") invalid("Only a request in production can book finished goods.", 409);
    if (await tx.workshopReceipt.findUnique({ where: { sourceRequestId: request.id } })) invalid("This request already has a workshop production record.", 409);
    if (!request.lines.length) invalid("Production needs product lines.", 409);
    const lines: { productId: string; quantity: string }[] = [];
    for (const line of request.lines) {
        if (line.producedQty === null || !Number.isSafeInteger(line.producedQty) || line.producedQty < 0) invalid("Save a valid non-negative produced quantity for every request line.", 409);
        if (line.producedQty > 0) lines.push({ productId: line.productId, quantity: amount(BigInt(line.producedQty) * BigInt(1000)) });
    }
    if (!lines.length) invalid("At least one produced quantity must be positive.", 409);
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())), note = `Completed production for ${trackingCode("REQ", request)}.`;
    const item = await tx.workshopReceipt.create({ data: { clientRequestId: `production:${request.id}`, createHash: createHash("sha256").update(`production:${request.id}`).digest("hex"), sourceType: "REQUEST_PRODUCTION", sourceRequestId: request.id,
        branchId: user.branchId, businessDate: date, status: "POSTED", note, createdById: user.id, postedById: user.id, postedAt: now, lines: { create: lines } } });
    await postWorkshopStock(tx, { ...item, lines }, user, now);
    await workshopEvent(tx, item.id, user, "REQUEST_PRODUCTION_POSTED", 1, note, { sourceRequestId: request.id, lines });
    return item.id;
}
