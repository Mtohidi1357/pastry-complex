import type { Prisma, WorkshopReceiptSource } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { amount, minor, invalid } from "../stock/stockValidation";
import { workshopActor } from "./workshopPolicy";
export const maximumStock = BigInt("999999999999999999");
export async function workshopLines(tx: Prisma.TransactionClient, sourceType: WorkshopReceiptSource, input: { productId: string; quantity: string }[], enforceActive = true) {
    if (!input.length || input.length > 200 || new Set(input.map(line => line.productId)).size !== input.length) invalid("Choose 1 to 200 distinct products.");
    const products = await tx.product.findMany({ where: { id: { in: input.map(line => line.productId) } }, select: { id: true, unit: true, isActive: true } });
    if (products.length !== input.length) invalid("One or more products do not exist.");
    return input.map(line => {
        const product = products.find(value => value.id === line.productId), quantity = minor(line.quantity);
        if (!product || quantity > maximumStock || (sourceType !== "OPENING_STOCK" && quantity === BigInt(0))) invalid("Production needs positive quantities; opening stock may be zero.");
        if (sourceType === "MANUAL_PRODUCTION" && enforceActive && !product.isActive) invalid("Choose active products for new manual production.");
        if (["PCS", "BOX"].includes(product.unit) && quantity % BigInt(1000) !== BigInt(0)) invalid("Pieces and boxes need whole quantities.");
        return { productId: line.productId, quantity: amount(quantity) };
    }).sort((a, b) => a.productId.localeCompare(b.productId));
}
export async function workshopOpeningAllowed(tx: Prisma.TransactionClient, branchId: string, productId: string) {
    const balance = await tx.branchStockBalance.findUnique({ where: { branchId_productId: { branchId, productId } } });
    const activeOpening = await tx.workshopReceiptLine.findFirst({ where: { productId, receipt: { is: { branchId, sourceType: "OPENING_STOCK", status: "POSTED" } } }, select: { id: true } });
    // An immediately voided opening may be replaced; real production/other stock history cannot be relabelled as opening.
    const history = await tx.stockMovement.findFirst({ where: { branchId, productId, OR: [
        { workshopReceiptId: null }, { workshopReceipt: { is: { sourceType: { not: "OPENING_STOCK" } } } }, { workshopReceipt: { is: { status: { not: "REVERSED" } } } },
    ] }, select: { id: true } });
    if (minor(balance?.quantity.toString() ?? "0") !== BigInt(0) || activeOpening || history) invalid("Opening stock requires zero recorded balance and no production/other history. Only a voided opening with no intervening stock activity may be replaced.", 409);
}
// Caller holds the BAKERY branch lock. Always use this transaction for every write.
export async function postWorkshopStock(tx: Prisma.TransactionClient, receipt: { id: string; branchId: string; sourceType: WorkshopReceiptSource; businessDate: Date; lines: { productId: string; quantity: string }[] }, user: CurrentUser, now: Date) {
    await workshopActor(tx, user, true);
    if (receipt.branchId !== user.branchId) invalid("Production must post to your own workshop.", 403);
    if (await tx.stockMovement.findFirst({ where: { workshopReceiptId: receipt.id }, select: { id: true } })) invalid("Workshop receipt already has stock movements.", 409);
    const lines = await workshopLines(tx, receipt.sourceType, receipt.lines);
    for (const line of lines) {
        if (receipt.sourceType === "OPENING_STOCK") await workshopOpeningAllowed(tx, receipt.branchId, line.productId);
        const key = { branchId: receipt.branchId, productId: line.productId }, quantity = minor(line.quantity);
        const balance = await tx.branchStockBalance.findUnique({ where: { branchId_productId: key } });
        const next = minor(balance?.quantity.toString() ?? "0") + quantity;
        if (next > maximumStock) invalid("Workshop stock would exceed the supported quantity.", 409);
        await tx.branchStockBalance.upsert({ where: { branchId_productId: key }, create: { ...key, quantity: amount(next), revision: 1 }, update: { quantity: amount(next), revision: { increment: 1 } } });
        if (quantity > BigInt(0)) await tx.stockMovement.create({ data: { ...key, workshopReceiptId: receipt.id, sourceKey: `workshop:${receipt.id}:${line.productId}`, kind: receipt.sourceType === "OPENING_STOCK" ? "OPENING_BALANCE" : "PRODUCTION", quantityDelta: amount(quantity), businessDate: receipt.businessDate, postedAt: now, actorId: user.id, reason: receipt.sourceType === "OPENING_STOCK" ? "Workshop opening stock." : "Finished-goods production." } });
    }
}
