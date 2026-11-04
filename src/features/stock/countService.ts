import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { stockScope } from "./stockPolicy";
import { amount, businessDate, invalid, minor } from "./stockValidation";
import type { StartCountInput, SaveCountInput } from "./countValidation";

type Tx = Prisma.TransactionClient;
const identity = { select: { id: true, username: true } } as const;
const detail = { branch: { select: { id: true, code: true, name: true } }, createdBy: identity, approvedBy: identity,
    lines: { orderBy: { productId: "asc" as const }, include: { product: { select: { id: true, code: true, displayName: true, unit: true } } } },
    events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], include: { actor: identity } },
} satisfies Prisma.StockCountInclude;
function missing(): never { throw new AppError(ApiErrorCode.NOT_FOUND, "Stock count not found.", 404); }
export function countRole(user: CurrentUser, role: "INV" | "BM") {
    if (user.roleCode !== role || !user.branchId) throw new PermissionDeniedError(role === "INV" ? "Only inventory users can enter stock counts." : "Only branch managers can approve or return counts.");
}
async function actor(tx: Tx, user: CurrentUser, role: "INV" | "BM") {
    const account = await tx.user.findFirst({ where: { id: user.id, branchId: user.branchId, isActive: true, role: { is: { code: role } } }, select: { id: true } });
    const branch = await tx.branch.findUnique({ where: { id: user.branchId }, select: { isActive: true, type: true } });
    if (!account || !branch?.isActive || branch.type !== "SALES") throw new PermissionDeniedError("An active account and sales branch are required.");
}
async function branchLock(tx: Tx, id: string) { const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM branches WHERE id = ${id} FOR UPDATE`; if (!rows.length) missing(); }
function view(tx: Tx, id: string) { return tx.stockCount.findUniqueOrThrow({ where: { id }, include: detail }); }
async function event(tx: Tx, id: string, user: CurrentUser, action: string, version: number, note?: string) {
    await tx.stockCountEvent.create({ data: { countId: id, actorId: user.id, action, version, note: note || null } });
}
async function openingAllowed(tx: Tx, branchId: string, productId: string) {
    const balance = await tx.branchStockBalance.findUnique({ where: { branchId_productId: { branchId, productId } } });
    const movement = await tx.stockMovement.findFirst({ where: { branchId, productId }, select: { id: true } });
    const previous = await tx.stockCountLine.findFirst({ where: { productId, count: { is: { branchId, kind: "OPENING", status: "APPROVED" } } }, select: { id: true } });
    if (movement || previous || (balance && (balance.revision !== 0 || minor(balance.quantity.toString()) !== BigInt(0)))) invalid("Opening stock is available only for products with no ledger history or approved opening. Use a physical count instead.", 409);
}
async function snapshot(tx: Tx, branchId: string, productId: string) {
    const value = await tx.branchStockBalance.findUnique({ where: { branchId_productId: { branchId, productId } } });
    return { expectedQuantity: value?.quantity.toString() ?? "0.000", snapshotRevision: value?.revision ?? 0 };
}
async function fresh(tx: Tx, count: { branchId: string; lines: { productId: string; expectedQuantity: { toString(): string }; snapshotRevision: number }[] }) {
    for (const line of count.lines) {
        const now = await snapshot(tx, count.branchId, line.productId);
        if (now.snapshotRevision !== line.snapshotRevision || minor(now.expectedQuantity) !== minor(line.expectedQuantity.toString())) invalid("Stock moved after this snapshot. Inventory must refresh the draft and recount. If submitted, the manager must first return it.", 409);
    }
}
async function locked<T>(user: CurrentUser, id: string, role: "INV" | "BM", operation: (tx: Tx) => Promise<T>) {
    countRole(user, role);
    const initial = await prisma.stockCount.findUnique({ where: { id }, select: { branchId: true } });
    if (!initial) missing(); stockScope(user, initial.branchId);
    return prisma.$transaction(async tx => {
        await branchLock(tx, user.branchId);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stock_counts WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) missing(); await actor(tx, user, role);
        return operation(tx);
    }, { timeout: 15_000 });
}
async function current(tx: Tx, id: string, user: CurrentUser) {
    const count = await tx.stockCount.findUnique({ where: { id }, include: { lines: { include: { product: { select: { unit: true } } } } } });
    if (!count) missing(); stockScope(user, count.branchId);
    if (user.roleCode === "INV" && count.createdById !== user.id) throw new PermissionDeniedError("Only the inventory user who started this count can edit or submit it.");
    return count;
}
function version(actual: number, expected: number) { if (actual !== expected) invalid("Count changed in another page. Close and reopen it before continuing.", 409); }
export async function startCount(user: CurrentUser, input: StartCountInput) {
    countRole(user, "INV"); const date = businessDate(input.businessDate);
    if (!input.productIds.length || input.productIds.length > 200 || new Set(input.productIds).size !== input.productIds.length) invalid("Choose between 1 and 200 distinct products.");
    return prisma.$transaction(async tx => {
        await branchLock(tx, user.branchId); await actor(tx, user, "INV");
        const existing = await tx.stockCount.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { lines: true } });
        if (existing) {
            if (existing.createdById !== user.id || existing.branchId !== user.branchId) throw new PermissionDeniedError("This count belongs to another user.");
            if (existing.kind !== input.kind || existing.businessDate.getTime() !== date.getTime() || [...existing.lines.map(line => line.productId)].sort().join() !== [...input.productIds].sort().join()) invalid("Create token already belongs to another count.", 409);
            return view(tx, existing.id);
        }
        const products = await tx.product.findMany({ where: { id: { in: input.productIds } }, select: { id: true } });
        if (products.length !== input.productIds.length) invalid("One or more products do not exist.");
        const lines: { productId: string; expectedQuantity: string; snapshotRevision: number }[] = [];
        for (const productId of [...input.productIds].sort()) {
            if (input.kind === "OPENING") await openingAllowed(tx, user.branchId, productId);
            lines.push({ productId, ...await snapshot(tx, user.branchId, productId) });
        }
        const count = await tx.stockCount.create({ data: { clientRequestId: input.clientRequestId, branchId: user.branchId, kind: input.kind, businessDate: date, createdById: user.id, lines: { create: lines } } });
        await event(tx, count.id, user, "STARTED", 1);
        return view(tx, count.id);
    }, { timeout: 15_000 });
}
export async function saveCount(user: CurrentUser, id: string, input: SaveCountInput) {
    return locked(user, id, "INV", async tx => {
        const count = await current(tx, id, user); version(count.version, input.version);
        if (count.status !== "DRAFT") invalid("Only draft counts can be edited.", 409);
        await fresh(tx, count);
        if (input.lines.length !== count.lines.length || new Set(input.lines.map(line => line.productId)).size !== input.lines.length) invalid("Enter exactly the products in this count.");
        for (const inputLine of input.lines) {
            const line = count.lines.find(value => value.productId === inputLine.productId);
            if (!line) invalid("Product does not belong to this count.");
            const quantity = minor(inputLine.countedQuantity);
            if (quantity > BigInt("999999999999999999")) invalid("Physical quantity exceeds its supported range.");
            if ((line.product.unit === "PCS" || line.product.unit === "BOX") && quantity % BigInt(1000) !== BigInt(0)) invalid("Pieces and boxes need whole quantities.");
            await tx.stockCountLine.update({ where: { countId_productId: { countId: id, productId: line.productId } }, data: { countedQuantity: amount(quantity) } });
        }
        await tx.stockCount.update({ where: { id }, data: { note: input.note || null, version: { increment: 1 } } });
        await event(tx, id, user, "SAVED", count.version + 1);
        return view(tx, id);
    });
}
export async function refreshCount(user: CurrentUser, id: string, expectedVersion: number) {
    return locked(user, id, "INV", async tx => {
        const count = await current(tx, id, user); version(count.version, expectedVersion);
        if (count.status !== "DRAFT") invalid("Only drafts can refresh their snapshot.", 409);
        for (const line of count.lines) {
            if (count.kind === "OPENING") await openingAllowed(tx, count.branchId, line.productId);
            await tx.stockCountLine.update({ where: { countId_productId: { countId: id, productId: line.productId } }, data: { ...await snapshot(tx, count.branchId, line.productId), countedQuantity: null } });
        }
        await tx.stockCount.update({ where: { id }, data: { version: { increment: 1 } } });
        await event(tx, id, user, "SNAPSHOT_REFRESHED_RECOUNT_REQUIRED", count.version + 1);
        return view(tx, id);
    });
}
export async function submitCount(user: CurrentUser, id: string, expectedVersion: number) {
    return locked(user, id, "INV", async tx => {
        const count = await current(tx, id, user);
        if (count.status === "SUBMITTED") return view(tx, id);
        version(count.version, expectedVersion);
        if (count.status !== "DRAFT") invalid("Only drafts can be submitted.", 409);
        await fresh(tx, count);
        if ((count.note?.trim().length ?? 0) < 5 || !count.lines.length || count.lines.some(line => line.countedQuantity === null)) invalid("Save a physical quantity for every product and a count note of at least five characters.");
        await tx.stockCount.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), version: { increment: 1 } } });
        await event(tx, id, user, "SUBMITTED", count.version + 1);
        return view(tx, id);
    });
}
export async function decideCount(user: CurrentUser, id: string, expectedVersion: number, reason: string, approve: boolean) {
    countRole(user, "BM"); if (reason.trim().length < 5) invalid("Enter a decision reason of at least five characters.");
    return locked(user, id, "BM", async tx => {
        const count = await current(tx, id, user);
        if (count.createdById === user.id) throw new PermissionDeniedError("A different manager must approve this count.");
        if (approve && count.status === "APPROVED") return view(tx, id);
        version(count.version, expectedVersion);
        if (count.status !== "SUBMITTED") invalid("Only submitted counts can be reviewed.", 409);
        if (!approve) {
            await tx.stockCount.update({ where: { id }, data: { status: "DRAFT", submittedAt: null, version: { increment: 1 } } });
            await event(tx, id, user, "RETURNED", count.version + 1, reason.trim());
            return view(tx, id);
        }
        await fresh(tx, count);
        if (!count.lines.length || count.lines.some(line => line.countedQuantity === null)) invalid("The submitted count is incomplete.", 409);
        const now = new Date();
        for (const line of count.lines) {
            if (count.kind === "OPENING") await openingAllowed(tx, count.branchId, line.productId);
            if (line.countedQuantity === null) invalid("A physical quantity is missing.", 409);
            const quantity = minor(line.countedQuantity.toString());
            if ((line.product.unit === "PCS" || line.product.unit === "BOX") && quantity % BigInt(1000) !== BigInt(0)) invalid("A product unit changed. Return this count for correction.", 409);
            const delta = quantity - minor(line.expectedQuantity.toString());
            if (delta === BigInt(0)) continue;
            const key = { branchId: count.branchId, productId: line.productId };
            await tx.branchStockBalance.upsert({ where: { branchId_productId: key }, create: { ...key, quantity: amount(quantity), revision: 1 }, update: { quantity: amount(quantity), revision: { increment: 1 } } });
            await tx.stockMovement.create({ data: { ...key, countId: id, sourceKey: `count:${id}:${line.productId}`, kind: count.kind === "OPENING" ? "OPENING_BALANCE" : "COUNT_ADJUSTMENT", quantityDelta: amount(delta), businessDate: count.businessDate, actorId: user.id, postedAt: now, reason: reason.trim() } });
        }
        await tx.stockCount.update({ where: { id }, data: { status: "APPROVED", approvedAt: now, approvedById: user.id, approvalReason: reason.trim(), version: { increment: 1 } } });
        await event(tx, id, user, "APPROVED", count.version + 1, reason.trim());
        return view(tx, id);
    });
}
export async function countDetail(user: CurrentUser, id: string) {
    stockScope(user); const count = await prisma.stockCount.findUnique({ where: { id }, include: detail });
    if (!count) missing(); stockScope(user, count.branchId); return count;
}
export async function listCounts(user: CurrentUser, page: number, branchId?: string, showFinished = false) {
    const where: Prisma.StockCountWhereInput = { ...stockScope(user, branchId), ...(!showFinished ? { status: { not: "APPROVED" as const } } : {}) }, pageSize = 20;
    const [items, totalItems] = await prisma.$transaction([
        prisma.stockCount.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, kind: true, status: true, businessDate: true, version: true, createdBy: identity, branch: { select: { code: true } } } }),
        prisma.stockCount.count({ where }),
    ]);
    return { items, totalItems, page, pageSize };
}
export async function countOptions(user: CurrentUser) {
    const scope = stockScope(user);
    const [products, branches] = await prisma.$transaction([
        prisma.product.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, displayName: true, unit: true, isActive: true } }),
        prisma.branch.findMany({ where: scope.branchId ? { id: scope.branchId } : {}, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    ]);
    return { products, branches };
}
