import { postReceiptToStock } from "./stockPosting";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { assertStockWrite, stockScope } from "./stockPolicy";
import { amount, businessDate, invalid, minor, type ReceiptInput } from "./stockValidation";

type Tx = Prisma.TransactionClient;
const identity = { select: { id: true, username: true } } as const;
const receiptView = {
    branch: { select: { id: true, code: true, name: true } }, createdBy: identity, confirmedBy: identity, reversedBy: identity,
    lines: { orderBy: { productId: "asc" as const }, include: { product: { select: { id: true, code: true, displayName: true, unit: true, isActive: true } } } },
} as const;
function notFound(): never { throw new AppError(ApiErrorCode.NOT_FOUND, "Receipt not found.", 404); }
async function lockBranch(tx: Tx, branchId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM branches WHERE id = ${branchId} FOR UPDATE`;
    if (!rows.length) notFound();
}
async function activeActor(tx: Tx, user: CurrentUser, action: "receive" | "reverse") {
    const actor = await tx.user.findFirst({ where: { id: user.id, branchId: user.branchId, isActive: true, role: { is: { code: action === "receive" ? "INV" : "BM" } } }, select: { id: true } });
    const branch = await tx.branch.findUnique({ where: { id: user.branchId }, select: { isActive: true, type: true } });
    if (!actor || !branch?.isActive || branch.type !== "SALES") throw new PermissionDeniedError("An active account in an active sales branch is required.");
}
async function validatedLines(tx: Tx, input: ReceiptInput) {
    businessDate(input.businessDate);
    if (input.lines.length < 1 || input.lines.length > 200) invalid("A receipt needs between 1 and 200 product rows.");
    const ids = input.lines.map(line => line.productId);
    if (new Set(ids).size !== ids.length) invalid("A product may appear only once in a receipt.");
    const products = await tx.product.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, unit: true } });
    if (products.length !== ids.length) invalid("One or more products are inactive or unavailable.");
    return input.lines.map(line => {
        const quantity = minor(line.quantity);
        if (quantity <= BigInt(0) || quantity > BigInt("999999999999")) invalid("Received quantities must be positive and within the supported range.");
        const unit = products.find(product => product.id === line.productId)?.unit;
        if ((unit === "PCS" || unit === "BOX") && quantity % BigInt(1000) !== BigInt(0)) invalid("Pieces and boxes require whole quantities.");
        return { productId: line.productId, quantity: amount(quantity) };
    }).sort((a, b) => a.productId.localeCompare(b.productId));
}
function view(tx: Tx, id: string) { return tx.stockReceipt.findUniqueOrThrow({ where: { id }, include: receiptView }); }
export async function createReceipt(user: CurrentUser, input: ReceiptInput & { clientRequestId: string }) {
    assertStockWrite(user, "receive");
    return prisma.$transaction(async tx => {
        await lockBranch(tx, user.branchId); await activeActor(tx, user, "receive");
        const lines = await validatedLines(tx, input);
        const hash = createHash("sha256").update(JSON.stringify({ branchId: user.branchId, creator: user.id, date: input.businessDate, note: input.note, lines })).digest("hex");
        const existing = await tx.stockReceipt.findUnique({ where: { clientRequestId: input.clientRequestId } });
        if (existing) {
            if (existing.branchId !== user.branchId || existing.createdById !== user.id) throw new PermissionDeniedError("This draft belongs to another user.");
            if (existing.createHash !== hash) invalid("This create token was already used for a different receipt. Reload to start a new draft.", 409);
            return view(tx, existing.id);
        }
        const receipt = await tx.stockReceipt.create({ data: {
            clientRequestId: input.clientRequestId, createHash: hash, branchId: user.branchId,
            createdById: user.id, businessDate: businessDate(input.businessDate), note: input.note || null,
            lines: { create: lines },
        } });
        return view(tx, receipt.id);
    }, { timeout: 15_000 });
}
async function locked<T>(user: CurrentUser, id: string, action: "receive" | "reverse", operation: (tx: Tx) => Promise<T>) {
    assertStockWrite(user, action);
    const initial = await prisma.stockReceipt.findUnique({ where: { id }, select: { branchId: true } });
    if (!initial) notFound();
    if (initial.branchId !== user.branchId) throw new PermissionDeniedError("This receipt belongs to another branch.");
    return prisma.$transaction(async tx => {
        await lockBranch(tx, user.branchId);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stock_receipts WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) notFound();
        await activeActor(tx, user, action);
        return operation(tx);
    }, { timeout: 15_000 });
}
async function owned(tx: Tx, id: string, user: CurrentUser) {
    const receipt = await tx.stockReceipt.findUnique({ where: { id }, include: { lines: true } });
    if (!receipt) notFound();
    if (receipt.branchId !== user.branchId) throw new PermissionDeniedError("This receipt belongs to another branch.");
    if (user.roleCode === "INV" && receipt.createdById !== user.id) throw new PermissionDeniedError("Only the inventory user who created this draft can change or confirm it.");
    return receipt;
}
export async function saveReceipt(user: CurrentUser, id: string, input: ReceiptInput & { version: number }) {
    return locked(user, id, "receive", async tx => {
        const receipt = await owned(tx, id, user);
        if (receipt.sourceType !== "MANUAL_RECEIPT" || receipt.status !== "DRAFT") invalid("Only manual drafts can be edited.", 409);
        if (receipt.version !== input.version) invalid("Draft changed in another page. Reload it before saving.", 409);
        const lines = await validatedLines(tx, input);
        await tx.stockReceiptLine.deleteMany({ where: { receiptId: id } });
        await tx.stockReceipt.update({ where: { id }, data: { businessDate: businessDate(input.businessDate), note: input.note || null, version: { increment: 1 }, lines: { create: lines } } });
        return view(tx, id);
    });
}
export async function confirmReceipt(user: CurrentUser, id: string, version: number) {
    return locked(user, id, "receive", async tx => {
        const receipt = await owned(tx, id, user);
        if (receipt.sourceType !== "MANUAL_RECEIPT") invalid("Request receipts are confirmed only by closing the linked request.", 409);
        if (receipt.status === "CONFIRMED") return view(tx, id); // Safe retry: never post again.
        if (receipt.status !== "DRAFT") invalid("A reversed receipt cannot be confirmed.", 409);
        if (receipt.version !== version) invalid("Draft changed. Reload it before confirming.", 409);
        const lines = await validatedLines(tx, { businessDate: receipt.businessDate.toISOString().slice(0, 10), note: receipt.note ?? "", lines: receipt.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) });
        const now = new Date();
        await postReceiptToStock(tx, { ...receipt, lines }, user.id, now);
        await tx.stockReceipt.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: now, confirmedById: user.id, version: { increment: 1 } } });
        return view(tx, id);
    });
}
export async function reverseReceipt(user: CurrentUser, id: string, version: number, reason: string) {
    if (reason.trim().length < 5) invalid("Enter a reversal reason of at least five characters.");
    return locked(user, id, "reverse", async tx => {
        const receipt = await owned(tx, id, user);
        if (receipt.status === "REVERSED") return view(tx, id);
        if (receipt.status !== "CONFIRMED") invalid("Only confirmed receipts can be reversed.", 409);
        if (receipt.version !== version) invalid("Receipt changed. Reload it before reversing.", 409);
        const originals = await tx.stockMovement.findMany({ where: { receiptId: id, kind: "RECEIPT" } });
        if (originals.length !== receipt.lines.length) invalid("Receipt movement history is inconsistent. No changes were made.", 409);
        for (const line of receipt.lines) {
            const current = await tx.branchStockBalance.findUnique({ where: { branchId_productId: { branchId: receipt.branchId, productId: line.productId } } });
            const quantity = minor(line.quantity.toString());
            const next = minor(current?.quantity.toString() ?? "0") - quantity;
            if (next < BigInt(0)) invalid("Reversal would make stock negative. Review later stock movements first.", 409);
            const original = originals.find(movement => movement.productId === line.productId);
            if (!original || original.branchId !== receipt.branchId || minor(original.quantityDelta.toString()) !== quantity) invalid("Original movement does not match receipt.", 409);
            await tx.branchStockBalance.update({ where: { branchId_productId: { branchId: receipt.branchId, productId: line.productId } }, data: { quantity: amount(next) } });
            await tx.stockMovement.create({ data: { branchId: receipt.branchId, productId: line.productId, receiptId: id, sourceKey: `${receipt.sourceType === "REQUEST_RECEIVING" ? "request" : "manual"}:${id}:${line.productId}:reverse`, kind: "RECEIPT_REVERSAL", quantityDelta: amount(-quantity), businessDate: receipt.businessDate, actorId: user.id, originalMovementId: original.id, reason: reason.trim() } });
        }
        await tx.stockReceipt.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: user.id, reversalReason: reason.trim(), version: { increment: 1 } } });
        return view(tx, id);
    });
}
export async function receiptDetail(user: CurrentUser, id: string) {
    stockScope(user);
    const receipt = await prisma.stockReceipt.findUnique({ where: { id }, include: receiptView });
    if (!receipt) notFound();
    stockScope(user, receipt.branchId);
    return receipt;
}
export async function stockOptions(user: CurrentUser) {
    const scope = stockScope(user);
    const [products, branches] = await prisma.$transaction([
        prisma.product.findMany({ where: { isActive: true }, select: { id: true, code: true, displayName: true, unit: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
        prisma.branch.findMany({ where: scope.branchId ? { id: scope.branchId } : {}, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    ]);
    return { products, branches };
}
export async function stockList(user: CurrentUser, kind: "receipts" | "balances" | "movements", page: number, branchId?: string, productId?: string, sourceType?: "MANUAL_RECEIPT" | "REQUEST_RECEIVING") {
    const scope = stockScope(user, branchId), pageSize = 20;
    const pagination = { skip: (page - 1) * pageSize, take: pageSize };
    if (kind === "receipts") {
        const where = { ...scope, ...(sourceType ? { sourceType } : {}), ...(productId ? { lines: { some: { productId } } } : {}) };
        const [items, totalItems] = await prisma.$transaction([
            prisma.stockReceipt.findMany({ where, ...pagination, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, businessDate: true, status: true, version: true, createdById: true, sourceType: true, sourceRequestId: true, branch: { select: { code: true } }, createdBy: identity, confirmedAt: true } }),
            prisma.stockReceipt.count({ where }),
        ]);
        return { items, totalItems, page, pageSize };
    }
    const where = { ...scope, ...(productId ? { productId } : {}) };
    if (kind === "balances") {
        if (sourceType) invalid("Ledger balances combine all receiving sources; filter receipts or movements instead.");
        const [items, totalItems] = await prisma.$transaction([
            prisma.branchStockBalance.findMany({ where, ...pagination, orderBy: [{ branchId: "asc" }, { productId: "asc" }], include: { branch: { select: { code: true } }, product: { select: { code: true, displayName: true, unit: true } } } }),
            prisma.branchStockBalance.count({ where }),
        ]);
        return { items, totalItems, page, pageSize };
    }
    const movementWhere = { ...where, ...(sourceType ? { receipt: { is: { sourceType } } } : {}) };
    const [items, totalItems] = await prisma.$transaction([
        prisma.stockMovement.findMany({ where: movementWhere, ...pagination, orderBy: [{ postedAt: "desc" }, { id: "asc" }], include: { branch: { select: { code: true } }, product: { select: { code: true, displayName: true, unit: true } }, actor: identity, receipt: { select: { sourceType: true, sourceRequestId: true } } } }),
        prisma.stockMovement.count({ where: movementWhere }),
    ]);
    return { items, totalItems, page, pageSize };
}
