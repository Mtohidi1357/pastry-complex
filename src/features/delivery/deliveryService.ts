import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { amount, minor, invalid, businessDate } from "../stock/stockValidation";
import { changeDocumentLease, requireDocumentLease } from "../stock/documentLease";
import { parseTrackingCode } from "@/lib/trackingCode";
import { allocation, deliveryStatus, type DeliveryAmounts } from "./deliveryQuantities";
import type { CreateDelivery, DeliveryAction } from "./deliveryValidation";

type Tx = Prisma.TransactionClient;
type Action = "dispatch" | "receive" | "return" | "cancel";
const identity = { select: { id: true, username: true, trackingNumber: true } } as const;
const branch = { select: { id: true, code: true, name: true, type: true, isActive: true } } as const;
const detail = { sourceBranch: branch, destinationBranch: branch, createdBy: identity, dispatchedBy: identity,
    sourceRequest: { select: { id: true, trackingNumber: true, status: true, assignedToId: true, deletedAt: true } },
    lines: { orderBy: { productId: "asc" as const }, include: { product: { select: { id: true, code: true, displayName: true, unit: true, isActive: true } } } },
    events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], include: { actor: identity } },
} satisfies Prisma.WorkshopDeliveryInclude;
type Item = Prisma.WorkshopDeliveryGetPayload<{ include: typeof detail }>;
function missing(): never { throw new AppError(ApiErrorCode.NOT_FOUND, "Delivery not found.", 404); }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function amounts(item: Item): DeliveryAmounts[] { return item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString(), receivedQuantity: line.receivedQuantity.toString(), returnedQuantity: line.returnedQuantity.toString() })); }
function scope(user: CurrentUser, item: { sourceBranchId: string; destinationBranchId: string }) {
    if (user.roleCode === "ADMIN") return;
    if (!["WM", "INV", "BM"].includes(user.roleCode) || ![item.sourceBranchId, item.destinationBranchId].includes(user.branchId)) throw new PermissionDeniedError("This delivery does not belong to your location.");
}
async function actor(tx: Tx, user: CurrentUser) {
    if (!["ADMIN", "WM", "INV", "BM"].includes(user.roleCode)) throw new PermissionDeniedError("Your role cannot access deliveries.");
    const account = await tx.user.findFirst({ where: { id: user.id, isActive: true, branchId: user.branchId, role: { is: { code: user.roleCode } } }, select: { id: true } });
    const location = await tx.branch.findUnique({ where: { id: user.branchId } });
    if (!account || (user.roleCode !== "ADMIN" && (!location?.isActive || (user.roleCode === "WM" && location.type !== "BAKERY") || (user.roleCode === "BM" && location.type !== "SALES")))) throw new PermissionDeniedError("An active account in the correct location is required.");
    return location;
}
async function branches(tx: Tx, ids: string[]) {
    for (const id of [...new Set(ids)].sort()) {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM branches WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) missing();
    }
}
function view(tx: Tx, id: string) { return tx.workshopDelivery.findUniqueOrThrow({ where: { id }, include: detail }); }
async function lockRequest(tx: Tx, id: string) { const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM daily_requests WHERE id = ${id} FOR UPDATE`; if (!rows.length) missing(); }
async function locked<T>(user: CurrentUser, id: string, operation: (tx: Tx, item: Item) => Promise<T>) {
    const initial = await prisma.workshopDelivery.findUnique({ where: { id } });
    if (!initial) missing(); scope(user, initial);
    return prisma.$transaction(async tx => {
        await branches(tx, [initial.sourceBranchId, initial.destinationBranchId]);
        if (initial.sourceRequestId) await lockRequest(tx, initial.sourceRequestId);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workshop_deliveries WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) missing();
        await actor(tx, user); const item = await view(tx, id); scope(user, item);
        return operation(tx, item);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
function authorize(user: CurrentUser, item: Item, action?: Action) {
    const outgoing = user.roleCode === "INV" && user.branchId === item.sourceBranchId;
    const incoming = user.roleCode === "BM" && user.branchId === item.destinationBranchId;
    if (action === "receive" ? !incoming : action ? !outgoing : !outgoing && !incoming) throw new PermissionDeniedError("Workshop inventory dispatches/accepts returns; the destination branch manager confirms receiving. Other roles monitor only.");
    if ((action === "dispatch" || action === "cancel" || (!action && item.status === "DRAFT")) && item.createdById !== user.id) throw new PermissionDeniedError("Only the inventory user who created this draft can dispatch or cancel it.");
    if (!item.sourceBranch.isActive || !item.destinationBranch.isActive || item.sourceBranch.type !== "BAKERY" || item.destinationBranch.type !== "SALES") throw new PermissionDeniedError("Delivery needs an active workshop and sales branch.");
}
async function event(tx: Tx, item: { id: string; version: number }, user: CurrentUser, action: string, note: string, payload: Prisma.InputJsonValue, clientRequestId?: string, payloadHash?: string) {
    return tx.workshopDeliveryEvent.create({ data: { deliveryId: item.id, actorId: user.id, action, version: item.version, note, payload, clientRequestId, payloadHash } });
}
async function checkRequest(tx: Tx, user: CurrentUser, input: { sourceRequestId?: string | null; destinationBranchId: string; lines: { productId: string; quantity: string }[] }) {
    if (!input.sourceRequestId) return;
    const request = await tx.dailyRequest.findUnique({ where: { id: input.sourceRequestId }, include: { lines: true, workshopReceipt: true } });
    if (!request || request.deletedAt || request.status !== "COMPLETED" || request.branchId !== input.destinationBranchId || request.workshopReceipt?.branchId !== user.branchId || request.workshopReceipt.status !== "POSTED") invalid("Choose a completed request produced by this workshop for that destination. Its production posting must remain active.", 409);
    for (const row of input.lines) {
        const product = request.lines.find(line => line.productId === row.productId);
        if (!product || product.producedQty === null || !Number.isSafeInteger(product.producedQty) || minor(row.quantity) > BigInt(product.producedQty) * BigInt(1000)) invalid("Request delivery cannot include unrelated products or exceed the saved produced quantities.", 409);
    }
}
export async function createDelivery(user: CurrentUser, input: CreateDelivery) {
    if (user.roleCode !== "INV") throw new PermissionDeniedError("Workshop inventory users create deliveries.");
    return prisma.$transaction(async tx => {
        await branches(tx, [user.branchId, input.destinationBranchId]); const source = await actor(tx, user);
        const destination = await tx.branch.findUnique({ where: { id: input.destinationBranchId } });
        if (source?.type !== "BAKERY" || !destination?.isActive || destination.type !== "SALES" || destination.id === user.branchId) throw new PermissionDeniedError("Dispatch must go from your active workshop to an active sales branch.");
        if (input.sourceRequestId) await lockRequest(tx, input.sourceRequestId);
        if (!input.lines.length || input.lines.length > 200 || new Set(input.lines.map(line => line.productId)).size !== input.lines.length) invalid("Choose distinct delivery products.");
        const products = await tx.product.findMany({ where: { id: { in: input.lines.map(line => line.productId) } } });
        const lines = input.lines.map(line => {
            const product = products.find(p => p.id === line.productId), value = minor(line.quantity);
            if (!product?.isActive || value <= BigInt(0) || value > BigInt("999999999999")) invalid("Dispatch active products with positive supported quantities.");
            if (["PCS", "BOX"].includes(product.unit) && value % BigInt(1000)) invalid("Pieces and boxes require whole quantities.");
            return { productId: line.productId, quantity: amount(value) };
        }).sort((a, b) => a.productId.localeCompare(b.productId));
        const date = businessDate(input.businessDate), note = input.note.trim();
        if (note.length < 5 || note.length > 1000) invalid("Enter a delivery note of 5 to 1000 characters.");
        const payload = { destinationBranchId: input.destinationBranchId, sourceRequestId: input.sourceRequestId ?? null, businessDate: date.toISOString(), note, lines }, hash = digest(payload);
        const existing = await tx.workshopDelivery.findUnique({ where: { clientRequestId: input.clientRequestId } });
        if (existing) { if (existing.createdById !== user.id || existing.sourceBranchId !== user.branchId) throw new PermissionDeniedError("Create token belongs to another user."); if (existing.createHash !== hash) invalid("Create token already belongs to a different delivery.", 409); return view(tx, existing.id); }
        await checkRequest(tx, user, { ...input, lines });
        if (input.sourceRequestId && await tx.workshopDelivery.findUnique({ where: { sourceRequestId: input.sourceRequestId } })) invalid("This request already has a delivery. Open that delivery instead.", 409);
        const item = await tx.workshopDelivery.create({ data: { clientRequestId: input.clientRequestId, createHash: hash, sourceBranchId: user.branchId, destinationBranchId: input.destinationBranchId, sourceRequestId: input.sourceRequestId, businessDate: date, note, createdById: user.id, lines: { create: lines } } });
        await event(tx, item, user, "CREATED", note, payload); return view(tx, item.id);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
async function balanceChange(tx: Tx, item: Item, user: CurrentUser, rows: { productId: string; quantity: string }[], kind: "DISPATCH" | "DELIVERY_RECEIVING" | "DISPATCH_RETURN", key: string, note: string, now: Date) {
    const branchId = kind === "DELIVERY_RECEIVING" ? item.destinationBranchId : item.sourceBranchId;
    for (const line of rows) {
        const quantity = minor(line.quantity), delta = kind === "DISPATCH" ? -quantity : quantity;
        const stockKey = { branchId, productId: line.productId }, current = await tx.branchStockBalance.findUnique({ where: { branchId_productId: stockKey } });
        const next = minor(current?.quantity.toString() ?? "0") + delta;
        if (next < BigInt(0)) invalid("Not enough workshop stock to dispatch these quantities. No goods were dispatched.", 409);
        if (next > BigInt("999999999999999999")) invalid("Stock would exceed the supported range.", 409);
        await tx.branchStockBalance.upsert({ where: { branchId_productId: stockKey }, create: { ...stockKey, quantity: amount(next), revision: 1 }, update: { quantity: amount(next), revision: { increment: 1 } } });
        await tx.stockMovement.create({ data: { ...stockKey, deliveryId: item.id, sourceKey: `delivery:${item.id}:${key}:${line.productId}`, kind, quantityDelta: amount(delta), businessDate: kind === "DISPATCH" ? item.businessDate : new Date(now.toISOString().slice(0, 10)), actorId: user.id, postedAt: now, reason: note } });
    }
}
export async function deliveryAction(user: CurrentUser, id: string, action: Action, input: DeliveryAction, editorToken?: string) {
    if (!["dispatch", "receive", "return", "cancel"].includes(action)) invalid("Unknown delivery action.");
    return locked(user, id, async (tx, item) => {
        authorize(user, item, action);
        await requireDocumentLease(tx, `delivery:${id}`, user, editorToken);
        const rows = (input.lines ?? []).map(line => ({ productId: line.productId, quantity: amount(minor(line.quantity)) })).sort((a, b) => a.productId.localeCompare(b.productId));
        const hash = digest({ id, action, reason: input.reason.trim(), lines: rows });
        const retry = await tx.workshopDeliveryEvent.findUnique({ where: { clientRequestId: input.clientRequestId } });
        if (retry) { if (retry.deliveryId !== id || retry.actorId !== user.id || retry.payloadHash !== hash) invalid("Action token was already used with different data.", 409); return view(tx, id); }
        if (item.version !== input.version) invalid("This delivery changed in another page. Your action was not applied. Close and reopen it.", 409);
        if (input.reason.trim().length < 5 || input.reason.trim().length > 1000) invalid("Enter a reason of 5 to 1000 characters.");
        const now = new Date(); let status = item.status;
        if (action === "dispatch" || action === "cancel") {
            if (item.status !== "DRAFT") invalid("Only an unposted delivery draft can be dispatched or cancelled.", 409);
            if (rows.length) invalid("Dispatch quantities come from the saved draft. Do not submit replacement rows.");
            if (action === "dispatch") {
                await checkRequest(tx, user, { sourceRequestId: item.sourceRequestId, destinationBranchId: item.destinationBranchId, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) });
                const products = await tx.product.findMany({ where: { id: { in: item.lines.map(line => line.productId) }, isActive: true } });
                if (products.length !== item.lines.length) invalid("Dispatch products must still be active.", 409);
                await balanceChange(tx, item, user, item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })), "DISPATCH", "dispatch", input.reason, now);
                status = "DISPATCHED";
            } else status = "CANCELLED";
        } else {
            if (item.status !== "DISPATCHED") invalid("Only goods still in transit can be received or returned.", 409);
            if (action === "receive" && item.sourceRequest && item.sourceRequest.status !== "CLOSED") invalid("For this request delivery, confirm initial receiving through the assigned manager's request form. Later outstanding goods can be received here after the request is closed.", 409);
            const applied = allocation(amounts(item), rows);
            for (const line of applied) {
                const product = item.lines.find(row => row.productId === line.productId)?.product;
                if (product && ["PCS", "BOX"].includes(product.unit) && minor(line.quantity) % BigInt(1000)) invalid("Pieces and boxes require whole quantities.");
                const original = item.lines.find(row => row.productId === line.productId)!;
                const field = action === "receive" ? "receivedQuantity" : "returnedQuantity";
                await tx.workshopDeliveryLine.update({ where: { deliveryId_productId: { deliveryId: id, productId: line.productId } }, data: { [field]: amount(minor(original[field].toString()) + minor(line.quantity)) } });
            }
            await balanceChange(tx, item, user, applied, action === "receive" ? "DELIVERY_RECEIVING" : "DISPATCH_RETURN", input.clientRequestId, input.reason, now);
            const updated = await view(tx, id); status = deliveryStatus(amounts(updated));
        }
        const updated = await tx.workshopDelivery.update({ where: { id }, data: { status, version: { increment: 1 }, ...(action === "cancel" ? { sourceRequestId: null } : {}), ...(action === "dispatch" ? { dispatchedAt: now, dispatchedById: user.id } : {}) } });
        await event(tx, updated, user, action.toUpperCase(), input.reason.trim() + (action === "cancel" && item.sourceRequest ? ` (Cancelled draft for REQ-${String(item.sourceRequest.trackingNumber).padStart(6, "0")}; request released for a replacement delivery.)` : ""), { lines: rows, sourceRequestId: item.sourceRequestId, requestTrackingNumber: item.sourceRequest?.trackingNumber ?? null }, input.clientRequestId, hash);
        return view(tx, id);
    });
}
export async function deliveryLease(user: CurrentUser, id: string, token: string, action: "acquire" | "renew" | "release") {
    return locked(user, id, async (tx, item) => { authorize(user, item); return { ...await changeDocumentLease(tx, `delivery:${id}`, user, token, action), version: item.version }; });
}
export async function deliveryDetail(user: CurrentUser, id: string) {
    return prisma.$transaction(async tx => { await actor(tx, user); const item = await tx.workshopDelivery.findUnique({ where: { id }, include: detail }); if (!item) missing(); scope(user, item); return item; });
}
export async function deliveryOptions(user: CurrentUser) {
    return prisma.$transaction(async tx => {
        const location = await actor(tx, user), creating = user.roleCode === "INV" && location?.type === "BAKERY";
        const products = await tx.product.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, displayName: true, unit: true } });
        const destinations = creating ? await tx.branch.findMany({ where: { isActive: true, type: "SALES" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }) : [];
        const requests = creating ? await tx.dailyRequest.findMany({ where: { deletedAt: null, status: "COMPLETED", workshopReceipt: { is: { branchId: user.branchId, status: "POSTED" } }, workshopDelivery: { is: null } }, orderBy: { createdAt: "desc" }, select: { id: true, trackingNumber: true, branchId: true, lines: { select: { productId: true, producedQty: true } } } }) : [];
        return { creating, products, destinations, requests };
    });
}
export async function deliveryList(user: CurrentUser, page: number, showFinished: boolean, reference?: string) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) invalid("Invalid delivery page.");
    const number = reference ? parseTrackingCode("DLV", reference) : null;
    if (reference && number === null) invalid("Enter a valid DLV code.");
    return prisma.$transaction(async tx => {
        await actor(tx, user);
        const where: Prisma.WorkshopDeliveryWhereInput = { ...(user.roleCode === "ADMIN" ? {} : { OR: [{ sourceBranchId: user.branchId }, { destinationBranchId: user.branchId }] }), ...(!showFinished ? { status: { in: ["DRAFT", "DISPATCHED"] } } : {}), ...(number !== null ? { trackingNumber: number } : {}) };
        const [items, totalItems] = await Promise.all([tx.workshopDelivery.findMany({ where, include: detail, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), tx.workshopDelivery.count({ where })]);
        return { items, totalItems, pageSize: 20 };
    });
}
