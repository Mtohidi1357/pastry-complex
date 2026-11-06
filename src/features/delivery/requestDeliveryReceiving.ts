import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { amount, invalid, minor } from "../stock/stockValidation";
import { deliveryStatus } from "./deliveryQuantities";

type RequestReceiving = { id: string; branchId: string; lines: { productId: string; receivedQty: number | null }[] };
// Called only inside CLOSE_REQUEST, after its branch and request row are locked.
// Never lock the source branch here: dispatch/return already serialize on the request row.
export async function linkRequestDeliveryReceiving(tx: Prisma.TransactionClient, request: RequestReceiving, user: CurrentUser, receiptId: string) {
    const production = await tx.workshopReceipt.findUnique({ where: { sourceRequestId: request.id }, select: { branchId: true } });
    // Historical requests without workshop booking retain their original receiving path.
    if (!production) return null;
    const initial = await tx.workshopDelivery.findUnique({ where: { sourceRequestId: request.id } });
    if (!initial) invalid("Workshop inventory must create and dispatch this request's delivery before you can confirm receiving.", 409);
    await tx.$queryRaw`SELECT id FROM workshop_deliveries WHERE id = ${initial.id} FOR UPDATE`;
    const delivery = await tx.workshopDelivery.findUniqueOrThrow({ where: { id: initial.id }, include: { lines: true } });
    if (delivery.sourceBranchId !== production.branchId || delivery.destinationBranchId !== request.branchId || delivery.status !== "DISPATCHED") invalid("This request needs an active dispatched delivery from its producing workshop.", 409);
    const rows = delivery.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString(), receivedQuantity: line.receivedQuantity.toString(), returnedQuantity: line.returnedQuantity.toString() }));
    const receiving: { productId: string; quantity: string }[] = [];
    for (const line of request.lines) {
        if (line.receivedQty === null || !Number.isSafeInteger(line.receivedQty) || line.receivedQty < 0) invalid("Save a non-negative received quantity for each request product.", 409);
        const value = BigInt(line.receivedQty) * BigInt(1000), target = rows.find(row => row.productId === line.productId);
        if (value > BigInt(0) && !target) invalid("Received product was not included in the workshop delivery.", 409);
        if (!target) continue;
        if (minor(target.receivedQuantity) !== BigInt(0)) invalid("Initial receiving was already recorded. Refresh this request.", 409);
        const available = minor(target.quantity) - minor(target.returnedQuantity);
        if (value > available) invalid("Received quantity exceeds the dispatched quantity still available for this request.", 409);
        target.receivedQuantity = amount(value);
        if (value > BigInt(0)) receiving.push({ productId: line.productId, quantity: amount(value) });
        await tx.workshopDeliveryLine.update({ where: { deliveryId_productId: { deliveryId: delivery.id, productId: line.productId } }, data: { receivedQuantity: amount(value) } });
    }
    const updated = await tx.workshopDelivery.update({ where: { id: delivery.id }, data: { status: deliveryStatus(rows), version: { increment: 1 } } });
    await tx.workshopDeliveryEvent.create({ data: { deliveryId: delivery.id, actorId: user.id, action: "REQUEST_RECEIVING", version: updated.version, note: "Initial receiving confirmed through the assigned manager's request form.", payload: { receiptId, sourceRequestId: request.id, lines: receiving } } });
    return delivery.id;
}
