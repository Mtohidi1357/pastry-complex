import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { AppError } from "@/errors/AppError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { ApiErrorCode } from "@/types/api";
import { amount, minor, invalid, businessDate } from "../stock/stockValidation";
import { changeDocumentLease, requireDocumentLease } from "../stock/documentLease";
import { parseTrackingCode, trackingCode } from "@/lib/trackingCode";
import { salesActor, salesScope } from "./salesPolicy";
import type { SalesCreate, SalesSave, SalesAction } from "./salesValidation";
type Tx = Prisma.TransactionClient;
type Action = "submit" | "review" | "post" | "reverse" | "cancel";
const identity = { select: { id: true, username: true, trackingNumber: true } } as const;
const detail = {
    branch: { select: { id: true, code: true, name: true, type: true, isActive: true } }, createdBy: identity, postedBy: identity, reversedBy: identity,
    corrects: { select: { id: true, trackingNumber: true } },
    corrections: { select: { id: true, trackingNumber: true, status: true }, orderBy: { createdAt: "asc" as const } },
    lines: { orderBy: { productId: "asc" as const }, include: { product: { select: { id: true, code: true, displayName: true, unit: true, isActive: true } } } },
    events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], include: { actor: identity } },
} satisfies Prisma.SalesReportInclude;
type Item = Prisma.SalesReportGetPayload<{ include: typeof detail }>;
function missing(): never { throw new AppError(ApiErrorCode.NOT_FOUND, "Sales report not found.", 404); }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function view(tx: Tx, id: string) { return tx.salesReport.findUniqueOrThrow({ where: { id }, include: detail }); }
async function lockBranch(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM branches WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) missing();
}
async function locked<T>(user: CurrentUser, id: string, operation: (tx: Tx, item: Item) => Promise<T>) {
    const initial = await prisma.salesReport.findUnique({ where: { id } });
    if (!initial) missing(); salesScope(user, initial);
    return prisma.$transaction(async tx => {
        await lockBranch(tx, initial.branchId);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sales_reports WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) missing(); await salesActor(tx, user);
        const item = await view(tx, id); salesScope(user, item); return operation(tx, item);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
function authorize(user: CurrentUser, item: Item, action: Action | "save") {
    const entering = user.roleCode === "INV" && user.branchId === item.branchId && item.createdById === user.id;
    const managing = user.roleCode === "BM" && user.branchId === item.branchId;
    if (["save", "submit", "cancel"].includes(action) ? !entering : !managing) throw new PermissionDeniedError("The draft's inventory user enters sales; its branch manager reviews, confirms or reverses. Administrators monitor only.");
    if (action === "post" && item.createdById === user.id) throw new PermissionDeniedError("A different branch manager must confirm this report.");
    if (!item.branch.isActive || item.branch.type !== "SALES") throw new PermissionDeniedError("Sales require an active sales branch.");
}
async function normalize(tx: Tx, input: { note: string; lines: { productId: string; quantity: string }[] }) {
    if (input.note.trim().length > 1000 || !input.lines.length || input.lines.length > 200 || new Set(input.lines.map(line => line.productId)).size !== input.lines.length) invalid("Choose 1 to 200 distinct products and a note of at most 1000 characters.");
    const products = await tx.product.findMany({ where: { id: { in: input.lines.map(line => line.productId) } }, select: { id: true, unit: true, isActive: true } });
    const lines = input.lines.map(line => {
        const product = products.find(p => p.id === line.productId), value = minor(line.quantity);
        if (!product?.isActive || value > BigInt("999999999999")) invalid("Choose active products and supported nonnegative sales quantities.");
        if (["PCS", "BOX"].includes(product.unit) && value % BigInt(1000) !== BigInt(0)) invalid("Pieces and boxes need whole quantities.");
        return { productId: line.productId, quantity: amount(value) };
    }).sort((a, b) => a.productId.localeCompare(b.productId));
    return { note: input.note.trim(), lines };
}
async function event(tx: Tx, item: { id: string; version: number }, user: CurrentUser, action: string, note: string, payload: Prisma.InputJsonValue, clientRequestId?: string, payloadHash?: string) {
    await tx.salesReportEvent.create({ data: { reportId: item.id, actorId: user.id, action, version: item.version, note, payload, clientRequestId, payloadHash } });
}
async function retry(tx: Tx, id: string, user: CurrentUser, token: string, digest: string) {
    const prior = await tx.salesReportEvent.findUnique({ where: { clientRequestId: token } });
    if (!prior) return false;
    if (prior.reportId !== id || prior.actorId !== user.id || prior.payloadHash !== digest) invalid("Operation token already belongs to different data.", 409);
    return true;
}
export async function createSales(user: CurrentUser, input: SalesCreate) {
    if (user.roleCode !== "INV") throw new PermissionDeniedError("Sales branch inventory creates daily sales drafts.");
    return prisma.$transaction(async tx => {
        await lockBranch(tx, user.branchId); await salesActor(tx, user);
        const value = await normalize(tx, input), date = businessDate(input.businessDate);
        const payload = { ...value, businessDate: date.toISOString(), correctsReportId: input.correctsReportId ?? null }, digest = hash(payload);
        const prior = await tx.salesReport.findUnique({ where: { clientRequestId: input.clientRequestId } });
        if (prior) {
            if (prior.createdById !== user.id || prior.branchId !== user.branchId) throw new PermissionDeniedError("Create token belongs to another user.");
            if (prior.createHash !== digest) invalid("Create token was used with different data.", 409);
            return view(tx, prior.id);
        }
        if (input.correctsReportId) {
            const original = await tx.salesReport.findUnique({ where: { id: input.correctsReportId } });
            if (!original || original.branchId !== user.branchId || original.status !== "REVERSED" || original.businessDate.getTime() !== date.getTime()) invalid("A correction must replace a reversed sales report from this branch and business date.", 409);
        }
        const day = await tx.salesDay.upsert({ where: { branchId_businessDate: { branchId: user.branchId, businessDate: date } }, create: { branchId: user.branchId, businessDate: date }, update: {} });
        if (day.activeReportId) {
            const active = await tx.salesReport.findUniqueOrThrow({ where: { id: day.activeReportId } });
            invalid(`${trackingCode("SLS", active)} already covers this branch and date (${active.status}). Open it, or reverse/cancel it before creating a replacement.`, 409);
        }
        const item = await tx.salesReport.create({ data: { clientRequestId: input.clientRequestId, createHash: digest, dayId: day.id, branchId: user.branchId, businessDate: date, note: value.note, createdById: user.id, correctsReportId: input.correctsReportId, lines: { create: value.lines } } });
        await tx.salesDay.update({ where: { id: day.id }, data: { activeReportId: item.id } });
        await event(tx, item, user, "CREATED", value.note, payload); return view(tx, item.id);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
export async function saveSales(user: CurrentUser, id: string, input: SalesSave, editorToken?: string) {
    return locked(user, id, async (tx, item) => {
        authorize(user, item, "save");
        const value = await normalize(tx, input), digest = hash({ id, action: "save", ...value });
        if (await retry(tx, id, user, input.clientRequestId, digest)) return view(tx, id);
        await requireDocumentLease(tx, `sales:${id}`, user, editorToken);
        if (item.status !== "DRAFT" || item.version !== input.version) invalid("Sales changed or are no longer a draft. Close and reopen; your edits were not saved.", 409);
        await tx.salesReportLine.deleteMany({ where: { reportId: id } });
        const updated = await tx.salesReport.update({ where: { id }, data: { note: value.note, lines: { create: value.lines }, version: { increment: 1 } } });
        await event(tx, updated, user, "SAVED", value.note, value, input.clientRequestId, digest); return view(tx, id);
    });
}
async function postStock(tx: Tx, item: Item, user: CurrentUser, reverse: boolean, reason: string) {
    const originals = reverse ? await tx.stockMovement.findMany({ where: { salesReportId: item.id, kind: "SALE" } }) : [];
    const positive = item.lines.filter(line => minor(line.quantity.toString()) > BigInt(0));
    if (reverse && originals.length !== positive.length) invalid("Original sales movements do not match the report. No stock changed.", 409);
    for (const line of positive) {
        const quantity = minor(line.quantity.toString()), original = originals.find(row => row.productId === line.productId);
        if (reverse && (!original || original.branchId !== item.branchId || (!original.quantityDelta.toString().startsWith("-") || minor(original.quantityDelta.toString().slice(1)) !== quantity))) invalid("Original sales movement is inconsistent. No stock changed.", 409);
        const key = { branchId: item.branchId, productId: line.productId }, delta = reverse ? quantity : -quantity;
        const balance = await tx.branchStockBalance.findUnique({ where: { branchId_productId: key } });
        const next = minor(balance?.quantity.toString() ?? "0") + delta;
        if (next < BigInt(0)) invalid(`Insufficient on-hand stock for ${line.product.code}. Nothing was posted.`, 409);
        if (next > BigInt("999999999999999999")) invalid("Stock exceeds the supported range. Nothing was posted.", 409);
        await tx.branchStockBalance.upsert({ where: { branchId_productId: key }, create: { ...key, quantity: amount(next), revision: 1 }, update: { quantity: amount(next), revision: { increment: 1 } } });
        await tx.stockMovement.create({ data: { ...key, salesReportId: item.id, sourceKey: `sales:${item.id}:${reverse ? "reverse" : "post"}:${line.productId}`, kind: reverse ? "SALE_REVERSAL" : "SALE", quantityDelta: amount(delta), businessDate: reverse ? new Date(new Date().toISOString().slice(0, 10)) : item.businessDate, actorId: user.id, reason, ...(reverse ? { originalMovementId: original?.id } : {}) } });
    }
}
export async function actOnSales(user: CurrentUser, id: string, action: Action, input: SalesAction, editorToken?: string) {
    if (!["submit", "review", "post", "reverse", "cancel"].includes(action)) invalid("Unknown sales action.");
    return locked(user, id, async (tx, item) => {
        authorize(user, item, action);
        const reason = input.reason.trim(); if (reason.length < 5 || reason.length > 1000) invalid("Enter a reason of 5 to 1000 characters.");
        const digest = hash({ id, action, reason });
        if (await retry(tx, id, user, input.clientRequestId, digest)) return view(tx, id);
        await requireDocumentLease(tx, `sales:${id}`, user, editorToken);
        if (item.version !== input.version) invalid("Sales changed in another page. Close and reopen; this action was not applied.", 409);
        const day = await tx.salesDay.findUniqueOrThrow({ where: { id: item.dayId } });
        if (day.activeReportId !== item.id || day.branchId !== item.branchId || day.businessDate.getTime() !== item.businessDate.getTime()) invalid("This report is no longer the active daily sales report.", 409);
        let status = item.status;
        if (action === "submit" || action === "cancel") {
            if (status !== "DRAFT") invalid("Only a draft can be submitted or cancelled.", 409);
            if (action === "submit") await normalize(tx, { note: item.note, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) });
            status = action === "submit" ? "SUBMITTED" : "CANCELLED";
        } else if (action === "review" || action === "post") {
            if (status !== "SUBMITTED") invalid("Only submitted sales can be returned for changes or confirmed.", 409);
            if (action === "post") {
                await normalize(tx, { note: item.note, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) });
                await postStock(tx, item, user, false, reason); status = "POSTED";
            } else status = "DRAFT";
        } else {
            if (status !== "POSTED") invalid("Only posted sales can be reversed.", 409);
            await postStock(tx, item, user, true, reason); status = "REVERSED";
        }
        const updated = await tx.salesReport.update({ where: { id }, data: { status, version: { increment: 1 }, ...(action === "post" ? { postedById: user.id, postedAt: new Date() } : {}), ...(action === "reverse" ? { reversedById: user.id, reversedAt: new Date(), reversalReason: reason } : {}) } });
        if (status === "REVERSED" || status === "CANCELLED") await tx.salesDay.update({ where: { id: day.id }, data: { activeReportId: null } });
        await event(tx, updated, user, action.toUpperCase(), reason, { status, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) }, input.clientRequestId, digest);
        return view(tx, id);
    });
}
export async function salesLease(user: CurrentUser, id: string, token: string, action: "acquire" | "renew" | "release") {
    return locked(user, id, async (tx, item) => {
        if (action === "release") {
            if (user.branchId !== item.branchId || !["INV", "BM"].includes(user.roleCode)) throw new PermissionDeniedError("Your role cannot edit sales.");
        } else if (item.status === "DRAFT") authorize(user, item, "save");
        else if (item.status === "SUBMITTED") authorize(user, item, "review");
        else if (item.status === "POSTED") authorize(user, item, "reverse");
        else invalid("This report is finished and read-only.", 409);
        return { ...await changeDocumentLease(tx, `sales:${id}`, user, token, action), version: item.version };
    });
}
export async function salesDetail(user: CurrentUser, id: string) {
    return prisma.$transaction(async tx => { await salesActor(tx, user); const item = await tx.salesReport.findUnique({ where: { id }, include: detail }); if (!item) missing(); salesScope(user, item); return item; });
}
export async function salesList(user: CurrentUser, page: number, showFinished = false, reference?: string, branchId?: string, date?: string, status?: "DRAFT" | "SUBMITTED" | "POSTED" | "REVERSED" | "CANCELLED") {
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) invalid("Invalid sales page.");
    const number = reference ? parseTrackingCode("SLS", reference) : null; if (reference && number === null) invalid("Enter a valid SLS reference.");
    if (branchId && user.roleCode !== "ADMIN" && branchId !== user.branchId) throw new PermissionDeniedError("Choose your own branch.");
    const day = date ? businessDate(date) : null;
    return prisma.$transaction(async tx => {
        await salesActor(tx, user);
        const where: Prisma.SalesReportWhereInput = { ...(user.roleCode === "ADMIN" ? branchId ? { branchId } : {} : { branchId: user.branchId }), ...(status ? { status } : !showFinished ? { status: { in: ["DRAFT", "SUBMITTED"] } } : {}), ...(number !== null ? { trackingNumber: number } : {}), ...(day ? { businessDate: day } : {}) };
        const [items, totalItems] = await Promise.all([tx.salesReport.findMany({ where, include: detail, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), tx.salesReport.count({ where })]);
        return { items, totalItems, pageSize: 20 };
    }, { isolationLevel: "RepeatableRead" });
}
export async function salesOptions(user: CurrentUser) {
    return prisma.$transaction(async tx => {
        await salesActor(tx, user);
        const products = await tx.product.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, displayName: true, unit: true, isActive: true } });
        const branches = await tx.branch.findMany({ where: { type: "SALES", ...(user.roleCode === "ADMIN" ? {} : { id: user.branchId }) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
        return { creating: user.roleCode === "INV", products, branches };
    });
}
