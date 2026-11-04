import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { stockScope } from "../stock/stockPolicy";
import { amount, minor, businessDate, invalid } from "../stock/stockValidation";
import { parseTrackingCode } from "@/lib/trackingCode";
import type { WasteInput } from "./wasteValidation";

type Tx = Prisma.TransactionClient;
export type WasteAction = "submit" | "approve" | "return" | "reverse" | "cancel";
const identity = { select: { id: true, username: true, trackingNumber: true } } as const;
const detail = { branch: { select: { id: true, code: true, name: true } }, createdBy: identity, approvedBy: identity, reversedBy: identity,
    lines: { orderBy: { productId: "asc" as const }, include: { product: { select: { id: true, code: true, displayName: true, unit: true, isActive: true } } } },
    events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], select: { id: true, action: true, note: true, version: true, createdAt: true, actor: identity } },
} satisfies Prisma.WasteCaseInclude;
const max = BigInt("999999999999999999");
function missing(): never { throw new AppError(ApiErrorCode.NOT_FOUND, "Waste case not found.", 404); }
function role(user: CurrentUser, expected: "INV" | "BM") {
    if (user.roleCode !== expected || !user.branchId) throw new PermissionDeniedError(expected === "INV" ? "Only inventory users can create, edit, submit or cancel waste drafts." : "Only branch managers can approve, return or reverse waste cases.");
}
async function actor(tx: Tx, user: CurrentUser) {
    stockScope(user);
    const account = await tx.user.findFirst({ where: { id: user.id, isActive: true, ...(user.roleCode !== "ADMIN" ? { branchId: user.branchId } : {}), role: { is: { code: user.roleCode } } }, select: { id: true } });
    if (!account) throw new PermissionDeniedError("An active account with your current role and branch is required.");
    if (user.roleCode !== "ADMIN") {
        const branch = await tx.branch.findUnique({ where: { id: user.branchId }, select: { isActive: true, type: true } });
        if (!branch?.isActive || branch.type !== "SALES") throw new PermissionDeniedError("An active sales branch is required.");
    }
}
function version(actual: number, expected: number) { if (!Number.isSafeInteger(expected) || expected < 1 || actual !== expected) invalid("Waste case changed. Close and reopen it before continuing.", 409); }
function view(tx: Tx, id: string) { return tx.wasteCase.findUniqueOrThrow({ where: { id }, include: detail }); }
async function event(tx: Tx, id: string, user: CurrentUser, action: string, nextVersion: number, note: string, payload: Prisma.InputJsonValue = {}) {
    await tx.wasteCaseEvent.create({ data: { wasteId: id, actorId: user.id, action, version: nextVersion, note, payload } });
}
async function branchLock(tx: Tx, id: string) { const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM branches WHERE id = ${id} FOR UPDATE`; if (!rows.length) missing(); }
async function normalize(tx: Tx, input: WasteInput) {
    const date = businessDate(input.businessDate), note = input.note.trim();
    if (note.length < 5 || note.length > 1000) invalid("Enter a case note of 5 to 1000 characters.");
    if (!input.lines.length || input.lines.length > 200 || new Set(input.lines.map(line => line.productId)).size !== input.lines.length) invalid("Choose 1 to 200 distinct products.");
    // Inactive products can still have stock that must be written off.
    const products = await tx.product.findMany({ where: { id: { in: input.lines.map(line => line.productId) } }, select: { id: true, unit: true } });
    if (products.length !== input.lines.length) invalid("One or more products do not exist.");
    const lines = input.lines.map(line => {
        const product = products.find(item => item.id === line.productId), quantity = minor(line.quantity), lineNote = line.note.trim();
        if (!product || quantity <= BigInt(0) || quantity > max) invalid("Waste quantities must be positive and within the supported range.");
        if (["PCS", "BOX"].includes(product.unit) && quantity % BigInt(1000) !== BigInt(0)) invalid("Pieces and boxes need whole quantities.");
        if (!["EXPIRED", "DAMAGED", "SPOILED", "OTHER"].includes(line.reason) || lineNote.length > 1000 || (line.reason === "OTHER" && lineNote.length < 5)) invalid("Choose a reason for every product. Other needs a note of at least five characters.");
        return { productId: line.productId, quantity: amount(quantity), reason: line.reason, note: lineNote || null };
    }).sort((a, b) => a.productId.localeCompare(b.productId));
    return { date, note, lines };
}
async function locked<T>(user: CurrentUser, id: string, expectedRole: "INV" | "BM", operation: (tx: Tx, item: Prisma.WasteCaseGetPayload<{ include: typeof detail }>) => Promise<T>) {
    role(user, expectedRole);
    const initial = await prisma.wasteCase.findUnique({ where: { id }, select: { branchId: true } });
    if (!initial) missing(); stockScope(user, initial.branchId);
    return prisma.$transaction(async tx => {
        await branchLock(tx, user.branchId);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM waste_cases WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) missing(); await actor(tx, user);
        const item = await view(tx, id); stockScope(user, item.branchId);
        if (expectedRole === "INV" && item.createdById !== user.id) throw new PermissionDeniedError("Only the inventory user who created this case can change its draft.");
        if (expectedRole === "BM" && item.createdById === user.id) throw new PermissionDeniedError("A different manager must review or reverse a case you created.");
        return operation(tx, item);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
export async function createWaste(user: CurrentUser, input: WasteInput & { clientRequestId: string }) {
    role(user, "INV");
    return prisma.$transaction(async tx => {
        await branchLock(tx, user.branchId); await actor(tx, user);
        const normalized = await normalize(tx, input);
        const payload = { businessDate: normalized.date.toISOString().slice(0, 10), note: normalized.note, lines: normalized.lines };
        const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
        const existing = await tx.wasteCase.findUnique({ where: { clientRequestId: input.clientRequestId } });
        if (existing) {
            if (existing.createdById !== user.id || existing.branchId !== user.branchId) throw new PermissionDeniedError("Create token belongs to another user.");
            if (existing.createHash !== hash) invalid("Create token already belongs to a different waste draft.", 409);
            return view(tx, existing.id);
        }
        const item = await tx.wasteCase.create({ data: { clientRequestId: input.clientRequestId, createHash: hash, branchId: user.branchId, businessDate: normalized.date, note: normalized.note, createdById: user.id, lines: { create: normalized.lines } } });
        await event(tx, item.id, user, "CREATED", 1, normalized.note, payload);
        return view(tx, item.id);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
export async function saveWaste(user: CurrentUser, id: string, input: WasteInput & { version: number }) {
    return locked(user, id, "INV", async (tx, item) => {
        version(item.version, input.version);
        if (item.status !== "DRAFT") invalid("Only draft waste cases can be edited.", 409);
        const normalized = await normalize(tx, input);
        const before = { businessDate: item.businessDate.toISOString().slice(0, 10), note: item.note, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString(), reason: line.reason, note: line.note })) };
        await tx.wasteCaseLine.deleteMany({ where: { wasteId: id } });
        await tx.wasteCase.update({ where: { id }, data: { businessDate: normalized.date, note: normalized.note, version: { increment: 1 }, lines: { create: normalized.lines } } });
        await event(tx, id, user, "SAVED", item.version + 1, normalized.note, { before, after: { businessDate: input.businessDate, note: normalized.note, lines: normalized.lines } });
        return view(tx, id);
    });
}
function signed(value: string): bigint { return value.startsWith("-") ? -minor(value.slice(1)) : minor(value); }
export async function actOnWaste(user: CurrentUser, id: string, expectedVersion: number, reason: string, action: WasteAction) {
    if (!["submit", "approve", "return", "reverse", "cancel"].includes(action)) invalid("Unknown waste action.");
    const expectedRole = action === "submit" || action === "cancel" ? "INV" : "BM";
    role(user, expectedRole);
    if (reason.trim().length < 5 || reason.trim().length > 1000) invalid("Enter an action reason of 5 to 1000 characters.");
    return locked(user, id, expectedRole, async (tx, item) => {
        // Repeated successful submissions/approvals/reversals are safe retries, never second postings.
        if ((action === "submit" && item.status === "SUBMITTED") || (action === "approve" && item.status === "APPROVED") || (action === "reverse" && item.status === "REVERSED") || (action === "cancel" && item.status === "CANCELLED")) return view(tx, id);
        version(item.version, expectedVersion);
        const now = new Date(), note = reason.trim(), nextVersion = item.version + 1;
        if (action === "submit" || action === "cancel") {
            if (item.status !== "DRAFT") invalid("Only draft cases can be submitted or cancelled.", 409);
            if (action === "submit") await normalize(tx, { businessDate: item.businessDate.toISOString().slice(0, 10), note: item.note, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString(), reason: line.reason, note: line.note ?? "" })) });
            await tx.wasteCase.update({ where: { id }, data: { status: action === "submit" ? "SUBMITTED" : "CANCELLED", ...(action === "submit" ? { submittedAt: now } : { cancelledAt: now }), version: { increment: 1 } } });
            await event(tx, id, user, action === "submit" ? "SUBMITTED" : "CANCELLED", nextVersion, note);
            return view(tx, id);
        }
        if (action === "return") {
            if (item.status !== "SUBMITTED") invalid("Only submitted cases can be returned.", 409);
            await tx.wasteCase.update({ where: { id }, data: { status: "DRAFT", submittedAt: null, version: { increment: 1 } } });
            await event(tx, id, user, "RETURNED", nextVersion, note);
            return view(tx, id);
        }
        if (action === "approve" && item.status !== "SUBMITTED") invalid("Only submitted cases can be approved.", 409);
        if (action === "reverse" && item.status !== "APPROVED") invalid("Only approved cases can be reversed.", 409);
        if (!item.lines.length) invalid("Waste case has no products.", 409);
        const originals = action === "reverse" ? await tx.stockMovement.findMany({ where: { wasteId: id, kind: "WASTE" } }) : [];
        if (action === "reverse" && originals.length !== item.lines.length) invalid("Original waste movements are inconsistent. No changes were made.", 409);
        for (const line of item.lines) {
            const quantity = minor(line.quantity.toString());
            if (quantity <= BigInt(0) || (["PCS", "BOX"].includes(line.product.unit) && quantity % BigInt(1000) !== BigInt(0))) invalid("Invalid waste quantity or unit. Return the case for correction.", 409);
            const key = { branchId: item.branchId, productId: line.productId };
            const balance = await tx.branchStockBalance.findUnique({ where: { branchId_productId: key } });
            if (!balance) invalid("No ledger stock is available for this product.", 409);
            const delta = action === "approve" ? -quantity : quantity, next = minor(balance.quantity.toString()) + delta;
            if (next < BigInt(0)) invalid(`Insufficient stock for ${line.product.code}. Approval would make stock negative. Return the case for correction.`, 409);
            if (next > max) invalid("Reversal would exceed the supported stock quantity.", 409);
            const original = originals.find(row => row.productId === line.productId);
            if (action === "reverse" && (!original || original.branchId !== item.branchId || signed(original.quantityDelta.toString()) !== -quantity)) invalid("Original movement does not match the waste case.", 409);
            await tx.branchStockBalance.update({ where: { branchId_productId: key }, data: { quantity: amount(next), revision: { increment: 1 } } });
            await tx.stockMovement.create({ data: { ...key, wasteId: id, sourceKey: `waste:${id}:${line.productId}${action === "reverse" ? ":reverse" : ""}`, kind: action === "approve" ? "WASTE" : "WASTE_REVERSAL", quantityDelta: amount(delta), businessDate: item.businessDate, postedAt: now, actorId: user.id, reason: note, ...(original ? { originalMovementId: original.id } : {}) } });
        }
        await tx.wasteCase.update({ where: { id }, data: { status: action === "approve" ? "APPROVED" : "REVERSED", ...(action === "approve" ? { approvedById: user.id, approvedAt: now, approvalReason: note } : { reversedById: user.id, reversedAt: now, reversalReason: note }), version: { increment: 1 } } });
        await event(tx, id, user, action === "approve" ? "APPROVED" : "REVERSED", nextVersion, note);
        return view(tx, id);
    });
}
export async function wasteDetail(user: CurrentUser, id: string) {
    stockScope(user);
    return prisma.$transaction(async tx => { await actor(tx, user); const item = await tx.wasteCase.findUnique({ where: { id }, include: detail }); if (!item) missing(); stockScope(user, item.branchId); return item; });
}
export async function wasteList(user: CurrentUser, page: number, showFinished = false, branchId?: string, tasks = false, reference?: string) {
    const scope = stockScope(user, branchId);
    if (tasks) role(user, "BM");
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) invalid("Invalid waste page.");
    const number = reference ? parseTrackingCode("WST", reference) : null;
    if (reference && number === null) invalid("Enter a valid WST code.");
    const due: Prisma.WasteCaseWhereInput = { status: "SUBMITTED", createdById: { not: user.id } };
    const where: Prisma.WasteCaseWhereInput = { ...scope, ...(number !== null ? { trackingNumber: number } : {}), ...(tasks ? (showFinished ? { OR: [due, { status: { in: ["APPROVED", "REVERSED"] } }] } : due) : (!showFinished ? { status: { in: ["DRAFT", "SUBMITTED"] } } : {})) };
    return prisma.$transaction(async tx => {
        await actor(tx, user);
        const [items, totalItems] = await Promise.all([
            tx.wasteCase.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: tasks ? "asc" : "desc" }, { id: "asc" }], select: { id: true, trackingNumber: true, status: true, businessDate: true, version: true, note: true, createdBy: identity, branch: { select: { code: true } }, _count: { select: { lines: true } } } }),
            tx.wasteCase.count({ where }),
        ]);
        return { items, totalItems, page, pageSize: 20 };
    }, { isolationLevel: "RepeatableRead" });
}
export async function wasteOptions(user: CurrentUser) {
    const scope = stockScope(user);
    return prisma.$transaction(async tx => {
        await actor(tx, user);
        const [products, branches] = await Promise.all([
            tx.product.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, displayName: true, unit: true, isActive: true } }),
            tx.branch.findMany({ where: scope.branchId ? { id: scope.branchId } : {}, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
        ]);
        return { products, branches };
    });
}
