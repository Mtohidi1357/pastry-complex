import { changeDocumentLease, requireDocumentLease } from "../stock/documentLease";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, WorkshopReceiptSource } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { amount, minor, invalid, businessDate } from "../stock/stockValidation";
import { parseTrackingCode } from "@/lib/trackingCode";
import { workshopActor, workshopScope, workshopWrite } from "./workshopPolicy";
import { maximumStock, postWorkshopStock, workshopLines, workshopOpeningAllowed } from "./workshopPosting";
import type { WorkshopInput } from "./workshopValidation";
type Tx = Prisma.TransactionClient;
const identity = { select: { id: true, username: true, trackingNumber: true } } as const;
const sourceRequest = { select: { id: true, trackingNumber: true, businessDate: true } } as const;
const detail = { branch: { select: { id: true, code: true, name: true, type: true } }, sourceRequest, createdBy: identity, postedBy: identity, reversedBy: identity,
    lines: { orderBy: { productId: "asc" as const }, include: { product: { select: { id: true, code: true, displayName: true, unit: true, isActive: true } } } },
    events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], select: { id: true, action: true, note: true, createdAt: true, actor: identity } },
} satisfies Prisma.WorkshopReceiptInclude;
function missing(): never { throw new AppError(ApiErrorCode.NOT_FOUND, "Workshop record not found.", 404); }
function view(tx: Tx, id: string) { return tx.workshopReceipt.findUniqueOrThrow({ where: { id }, include: detail }); }
async function branchLock(tx: Tx, id: string) { const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM branches WHERE id = ${id} FOR UPDATE`; if (!rows.length) missing(); }
export async function workshopEvent(tx: Tx, id: string, user: CurrentUser, action: string, version: number, note: string, payload: Prisma.InputJsonValue = {}) {
    await tx.workshopReceiptEvent.create({ data: { receiptId: id, actorId: user.id, action, version, note, payload } });
}
function version(actual: number, expected: number) { if (!Number.isSafeInteger(expected) || expected < 1 || actual !== expected) invalid("Workshop record changed. Close and reopen it before continuing.", 409); }
async function normalize(tx: Tx, input: WorkshopInput, existingCreateRetry = false) {
    if (!["MANUAL_PRODUCTION", "OPENING_STOCK"].includes(input.sourceType)) invalid("Request production is booked by its workflow, not manual entry.");
    const date = businessDate(input.businessDate), note = input.note.trim();
    if (note.length < 5 || note.length > 1000) invalid("Enter a batch/opening note of 5 to 1000 characters.");
    const lines = await workshopLines(tx, input.sourceType, input.lines, !existingCreateRetry);
    return { date, note, lines };
}
async function locked<T>(user: CurrentUser, id: string, operation: (tx: Tx, item: Prisma.WorkshopReceiptGetPayload<{ include: typeof detail }>) => Promise<T>) {
    workshopWrite(user);
    const initial = await prisma.workshopReceipt.findUnique({ where: { id }, select: { branchId: true } });
    if (!initial) missing(); workshopScope(user, initial.branchId);
    return prisma.$transaction(async tx => {
        await branchLock(tx, user.branchId);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workshop_receipts WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) missing(); await workshopActor(tx, user, true);
        const item = await view(tx, id); workshopScope(user, item.branchId);
        return operation(tx, item);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
function ownDraft(item: { createdById: string; status: string; sourceType: string }, user: CurrentUser) {
    if (item.createdById !== user.id) throw new PermissionDeniedError("Only the workshop manager who created this draft can edit, post or cancel it.");
    if (item.status !== "DRAFT" || item.sourceType === "REQUEST_PRODUCTION") invalid("Only manual/opening drafts can be changed.", 409);
}
export async function createWorkshop(user: CurrentUser, input: WorkshopInput & { clientRequestId: string }) {
    workshopWrite(user);
    return prisma.$transaction(async tx => {
        await branchLock(tx, user.branchId); await workshopActor(tx, user, true);
        const existing = await tx.workshopReceipt.findUnique({ where: { clientRequestId: input.clientRequestId } });
        if (existing && (existing.createdById !== user.id || existing.branchId !== user.branchId)) throw new PermissionDeniedError("Create token belongs to another user.");
        const normalized = await normalize(tx, input, !!existing), payload = { sourceType: input.sourceType, businessDate: normalized.date.toISOString().slice(0, 10), note: normalized.note, lines: normalized.lines };
        const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
        if (existing) {
            if (existing.createdById !== user.id || existing.branchId !== user.branchId) throw new PermissionDeniedError("Create token belongs to another user.");
            if (existing.createHash !== hash) invalid("Create token already belongs to another workshop draft.", 409);
            return view(tx, existing.id);
        }
        if (input.sourceType === "OPENING_STOCK") for (const line of normalized.lines) await workshopOpeningAllowed(tx, user.branchId, line.productId);
        const item = await tx.workshopReceipt.create({ data: { clientRequestId: input.clientRequestId, createHash: hash, sourceType: input.sourceType, branchId: user.branchId, businessDate: normalized.date, note: normalized.note, createdById: user.id, lines: { create: normalized.lines } } });
        await workshopEvent(tx, item.id, user, "CREATED", 1, normalized.note, payload); return view(tx, item.id);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
export async function saveWorkshop(user: CurrentUser, id: string, input: WorkshopInput & { version: number }, editorToken?: string) {
    return locked(user, id, async (tx, item) => {
        ownDraft(item, user); await requireDocumentLease(tx, `workshop:${id}`, user, editorToken); version(item.version, input.version);
        if (input.sourceType !== item.sourceType) invalid("Record type is fixed. Cancel the draft and create the correct type instead.", 409);
        const normalized = await normalize(tx, input);
        if (input.sourceType === "OPENING_STOCK") for (const line of normalized.lines) await workshopOpeningAllowed(tx, item.branchId, line.productId);
        const before = { businessDate: item.businessDate.toISOString().slice(0, 10), note: item.note, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) };
        await tx.workshopReceiptLine.deleteMany({ where: { receiptId: id } });
        await tx.workshopReceipt.update({ where: { id }, data: { businessDate: normalized.date, note: normalized.note, lines: { create: normalized.lines }, version: { increment: 1 } } });
        await workshopEvent(tx, id, user, "SAVED", item.version + 1, normalized.note, { before, after: { businessDate: input.businessDate, note: normalized.note, lines: normalized.lines } });
        return view(tx, id);
    });
}
export async function actOnWorkshop(user: CurrentUser, id: string, expectedVersion: number, reason: string, action: "post" | "reverse" | "cancel", editorToken?: string) {
    workshopWrite(user);
    if (!["post", "reverse", "cancel"].includes(action)) invalid("Unknown workshop action.");
    if (reason.trim().length < 5 || reason.trim().length > 1000) invalid("Enter a reason of 5 to 1000 characters.");
    return locked(user, id, async (tx, item) => {
        if (action !== "reverse" && item.createdById !== user.id) throw new PermissionDeniedError("Only the draft's creator can post or cancel it.");
        await requireDocumentLease(tx, `workshop:${id}`, user, editorToken);
        if ((action === "post" && item.status === "POSTED") || (action === "reverse" && item.status === "REVERSED") || (action === "cancel" && item.status === "CANCELLED")) return view(tx, id);
        version(item.version, expectedVersion); const now = new Date(), note = reason.trim();
        if (action === "post" || action === "cancel") {
            ownDraft(item, user);
            if (action === "post") await postWorkshopStock(tx, { ...item, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) }, user, now);
            await tx.workshopReceipt.update({ where: { id }, data: { status: action === "post" ? "POSTED" : "CANCELLED", ...(action === "post" ? { postedAt: now, postedById: user.id } : { cancelledAt: now }), version: { increment: 1 } } });
        } else {
            if (item.status !== "POSTED") invalid("Only posted workshop records can be reversed.", 409);
            const originals = await tx.stockMovement.findMany({ where: { workshopReceiptId: id, kind: { in: ["PRODUCTION", "OPENING_BALANCE"] } } });
            if (originals.length !== item.lines.filter(line => minor(line.quantity.toString()) > BigInt(0)).length) invalid("Original workshop movement history is inconsistent.", 409);
            for (const line of item.lines) {
                const quantity = minor(line.quantity.toString()), key = { branchId: item.branchId, productId: line.productId };
                const balance = await tx.branchStockBalance.findUnique({ where: { branchId_productId: key } });
                if (!balance) invalid("Workshop balance is missing. No changes were made.", 409);
                const next = minor(balance.quantity.toString()) - quantity;
                if (next < BigInt(0) || next > maximumStock) invalid("Reversal would make workshop stock negative. Review later stock activity first.", 409);
                const original = originals.find(row => row.productId === line.productId);
                if (quantity > BigInt(0) && (!original || original.branchId !== item.branchId || original.kind !== (item.sourceType === "OPENING_STOCK" ? "OPENING_BALANCE" : "PRODUCTION") || minor(original.quantityDelta.toString()) !== quantity)) invalid("Original movement does not match this workshop record.", 409);
                await tx.branchStockBalance.update({ where: { branchId_productId: key }, data: { quantity: amount(next), revision: { increment: 1 } } });
                if (quantity > BigInt(0) && original) await tx.stockMovement.create({ data: { ...key, workshopReceiptId: id, sourceKey: `workshop:${id}:${line.productId}:reverse`, kind: "PRODUCTION_REVERSAL", quantityDelta: amount(-quantity), originalMovementId: original.id, businessDate: item.businessDate, actorId: user.id, postedAt: now, reason: note } });
            }
            await tx.workshopReceipt.update({ where: { id }, data: { status: "REVERSED", reversedAt: now, reversedById: user.id, reversalReason: note, version: { increment: 1 } } });
        }
        await workshopEvent(tx, id, user, action === "post" ? "POSTED" : action === "cancel" ? "CANCELLED" : "REVERSED", item.version + 1, note);
        return view(tx, id);
    });
}
export async function workshopDetail(user: CurrentUser, id: string) {
    workshopScope(user);
    return prisma.$transaction(async tx => { await workshopActor(tx, user); const item = await tx.workshopReceipt.findUnique({ where: { id }, include: detail }); if (!item || item.branch.type !== "BAKERY") missing(); workshopScope(user, item.branchId); return item; });
}
export async function workshopOptions(user: CurrentUser) {
    const scope = workshopScope(user);
    return prisma.$transaction(async tx => { await workshopActor(tx, user); const [products, branches] = await Promise.all([
        tx.product.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, displayName: true, unit: true, isActive: true } }),
        tx.branch.findMany({ where: { type: "BAKERY", ...(scope.branchId ? { id: scope.branchId } : {}) }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, isActive: true } }),
    ]); return { products, branches }; });
}
export async function workshopList(user: CurrentUser, kind: "receipts" | "balances" | "movements", page: number, showFinished = false, branchId?: string, productId?: string, sourceType?: WorkshopReceiptSource, reference?: string) {
    const scope = workshopScope(user, branchId), number = reference ? parseTrackingCode("WRK", reference) : null;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) invalid("Invalid workshop page.");
    if (reference && number === null) invalid("Enter a valid WRK code.");
    if (kind === "balances" && (reference || sourceType)) invalid("Recorded balances combine all workshop sources. Filter records or movements instead.");
    const whereBase = { ...scope, branch: { is: { type: "BAKERY" as const } } }, pagination = { skip: (page - 1) * 20, take: 20 };
    return prisma.$transaction(async tx => {
        await workshopActor(tx, user);
        if (kind === "receipts") {
            const where: Prisma.WorkshopReceiptWhereInput = { ...whereBase, ...(!showFinished ? { status: "DRAFT" } : {}), ...(productId ? { lines: { some: { productId } } } : {}), ...(sourceType ? { sourceType } : {}), ...(number !== null ? { trackingNumber: number } : {}) };
            const [items, totalItems] = await Promise.all([tx.workshopReceipt.findMany({ where, ...pagination, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, trackingNumber: true, businessDate: true, sourceType: true, status: true, note: true, branch: { select: { code: true } }, sourceRequest, createdBy: identity } }), tx.workshopReceipt.count({ where })]);
            return { items, totalItems, page, pageSize: 20 };
        }
        const where = { ...whereBase, ...(productId ? { productId } : {}) }, product = { select: { id: true, code: true, displayName: true, unit: true } } as const, branch = { select: { code: true } } as const;
        if (kind === "balances") {
            const [items, totalItems] = await Promise.all([tx.branchStockBalance.findMany({ where, ...pagination, orderBy: [{ branchId: "asc" }, { productId: "asc" }], include: { branch, product } }), tx.branchStockBalance.count({ where })]);
            return { items, totalItems, page, pageSize: 20 };
        }
        const movementWhere: Prisma.StockMovementWhereInput = { ...where, ...(sourceType || number !== null ? { workshopReceipt: { is: { ...(sourceType ? { sourceType } : {}), ...(number !== null ? { trackingNumber: number } : {}) } } } : {}) };
        const [items, totalItems] = await Promise.all([tx.stockMovement.findMany({ where: movementWhere, ...pagination, orderBy: [{ postedAt: "desc" }, { id: "asc" }], include: { branch, product, actor: identity, workshopReceipt: { select: { id: true, trackingNumber: true, sourceType: true, sourceRequest } } } }), tx.stockMovement.count({ where: movementWhere })]);
        return { items, totalItems, page, pageSize: 20 };
    }, { isolationLevel: "RepeatableRead" });
}

export async function workshopLease(user: CurrentUser, id: string, token: string, action: "acquire" | "renew" | "release") {
    return locked(user, id, async (tx, item) => {
        if (item.status === "DRAFT") ownDraft(item, user);
        if (action !== "release" && !["DRAFT", "POSTED"].includes(item.status)) invalid("This record is finished and cannot be edited.", 409);
        return { ...await changeDocumentLease(tx, `workshop:${id}`, user, token, action), version: item.version };
    });
}
