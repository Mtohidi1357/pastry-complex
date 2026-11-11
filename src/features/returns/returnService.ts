import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { AppError } from "@/errors/AppError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { ApiErrorCode } from "@/types/api";
import { amount, minor, invalid, businessDate } from "../stock/stockValidation";
import { changeDocumentLease, requireDocumentLease } from "../stock/documentLease";
import { parseTrackingCode } from "@/lib/trackingCode";
import { returnActor, returnScope } from "./returnPolicy";
import { allocateReturn, returnStatus, type ReturnAmounts } from "./returnQuantities";
import type { ReturnCreate, ReturnSave, ReturnAction } from "./returnValidation";

type Tx = Prisma.TransactionClient;
type Action = "submit" | "review" | "dispatch" | "receive" | "restore" | "cancel";
const identity = { select: { id: true, username: true, trackingNumber: true } } as const;
const branch = { select: { id: true, code: true, name: true, type: true, isActive: true } } as const;
const detail = { sourceBranch: branch, destinationBranch: branch, createdBy: identity, dispatchedBy: identity,
    sourceRequest: { select: { id: true, trackingNumber: true, status: true } },
    lines: { orderBy: { productId: "asc" as const }, include: { product: { select: { id: true, code: true, displayName: true, unit: true, isActive: true } } } },
    events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], include: { actor: identity } },
} satisfies Prisma.StockReturnInclude;
type Item = Prisma.StockReturnGetPayload<{ include: typeof detail }>;
function missing(): never { throw new AppError(ApiErrorCode.NOT_FOUND, "Stock return not found.", 404); }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function amounts(item: Item): ReturnAmounts[] { return item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString(), receivedQuantity: line.receivedQuantity.toString(), restoredQuantity: line.restoredQuantity.toString() })); }
function view(tx: Tx, id: string) { return tx.stockReturn.findUniqueOrThrow({ where: { id }, include: detail }); }
async function lockBranches(tx: Tx, ids: string[]) {
    for (const id of [...new Set(ids)].sort()) { const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM branches WHERE id = ${id} FOR UPDATE`; if (!rows.length) missing(); }
}
async function lockRequest(tx: Tx, id: string) { const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM daily_requests WHERE id = ${id} FOR UPDATE`; if (!rows.length) missing(); }
async function locked<T>(user: CurrentUser, id: string, operation: (tx: Tx, item: Item) => Promise<T>) {
    const initial = await prisma.stockReturn.findUnique({ where: { id } });
    if (!initial) missing(); returnScope(user, initial);
    return prisma.$transaction(async tx => {
        await lockBranches(tx, [initial.sourceBranchId, initial.destinationBranchId]);
        if (initial.sourceRequestId) await lockRequest(tx, initial.sourceRequestId);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stock_returns WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) missing(); await returnActor(tx, user); const item = await view(tx, id); returnScope(user, item);
        return operation(tx, item);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
function authorize(user: CurrentUser, item: Item, action: Action | "save") {
    const entering = user.roleCode === "INV" && user.branchId === item.sourceBranchId && item.createdById === user.id;
    const reviewing = user.roleCode === "BM" && user.branchId === item.sourceBranchId;
    const receiving = user.roleCode === "INV" && user.branchId === item.destinationBranchId;
    const restoring = user.roleCode === "INV" && user.branchId === item.sourceBranchId;
    if (["save", "submit", "cancel"].includes(action) ? !entering : ["review", "dispatch"].includes(action) ? !reviewing : action === "receive" ? !receiving : !restoring) throw new PermissionDeniedError("Branch inventory enters returns; its manager approves dispatch; workshop inventory confirms receiving. Other roles monitor only.");
    if (action === "dispatch" && item.createdById === user.id) throw new PermissionDeniedError("A different manager must approve and dispatch this return.");
    if (!item.sourceBranch.isActive || item.sourceBranch.type !== "SALES" || !item.destinationBranch.isActive || item.destinationBranch.type !== "BAKERY") throw new PermissionDeniedError("Return needs an active sales branch and destination workshop.");
}
async function event(tx: Tx, item: { id: string; version: number }, user: CurrentUser, action: string, note: string, payload: Prisma.InputJsonValue, clientRequestId?: string, payloadHash?: string) {
    return tx.stockReturnEvent.create({ data: { returnId: item.id, actorId: user.id, action, version: item.version, note, payload, clientRequestId, payloadHash } });
}
async function normalize(tx: Tx, input: { condition: string; note: string; businessDate: string; lines: { productId: string; quantity: string }[] }) {
    if (input.condition !== "SALEABLE") invalid("Damaged or expired goods must use the waste workflow, not saleable stock returns.");
    const note = input.note.trim(), date = businessDate(input.businessDate);
    if (note.length < 5 || note.length > 1000) invalid("Enter a return note of 5 to 1000 characters.");
    if (!input.lines.length || input.lines.length > 200 || new Set(input.lines.map(line => line.productId)).size !== input.lines.length) invalid("Choose 1 to 200 distinct return products.");
    const products = await tx.product.findMany({ where: { id: { in: input.lines.map(line => line.productId) } }, select: { id: true, unit: true } });
    const lines = input.lines.map(line => {
        const product = products.find(p => p.id === line.productId), quantity = minor(line.quantity);
        if (!product || quantity <= BigInt(0) || quantity > BigInt("999999999999")) invalid("Return positive supported quantities for existing products.");
        if (["PCS", "BOX"].includes(product.unit) && quantity % BigInt(1000) !== BigInt(0)) invalid("Pieces and boxes need whole quantities.");
        return { productId: line.productId, quantity: amount(quantity) };
    }).sort((a, b) => a.productId.localeCompare(b.productId));
    return { note, date, lines };
}
// Caller holds the source location and request locks when validating a write.
async function eligibleRequest(tx: Tx, user: CurrentUser, id: string, excludeId?: string) {
    const request = await tx.dailyRequest.findUnique({ where: { id } });
    const receipt = await tx.stockReceipt.findUnique({ where: { sourceRequestId: id }, include: { lines: true } });
    if (!request || request.deletedAt || request.branchId !== user.branchId || request.status !== "CLOSED" || !receipt || receipt.status !== "CONFIRMED") invalid("Choose a closed request with confirmed receiving in this sales branch.", 409);
    const delivery = await tx.workshopDelivery.findUnique({ where: { sourceRequestId: id }, include: { lines: true } });
    const production = await tx.workshopReceipt.findUnique({ where: { sourceRequestId: id }, select: { branchId: true } });
    const used = await tx.stockReturnLine.findMany({ where: { returnCase: { is: { sourceRequestId: id, sourceBranchId: user.branchId, status: { in: ["SUBMITTED", "DISPATCHED", "RECEIVED", "RESTORED", "RESOLVED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) } } }, select: { productId: true, quantity: true, restoredQuantity: true } });
    const capacities = new Map<string, bigint>();
    if (delivery) for (const line of delivery.lines) capacities.set(line.productId, minor(line.receivedQuantity.toString()));
    else for (const line of receipt.lines) capacities.set(line.productId, minor(line.quantity.toString()));
    for (const line of used) { const reserved = minor(line.quantity.toString()) - minor(line.restoredQuantity.toString()); if (reserved < BigInt(0)) invalid("Prior return totals are inconsistent.", 409); capacities.set(line.productId, (capacities.get(line.productId) ?? BigInt(0)) - reserved); }
    return { request, destinationBranchId: delivery?.sourceBranchId ?? production?.branchId ?? null, lines: [...capacities].map(([productId, value]) => ({ productId, quantity: amount(value > BigInt(0) ? value : BigInt(0)) })) };
}
async function validateLink(tx: Tx, user: CurrentUser, item: { sourceRequestId?: string | null; destinationBranchId: string; lines: { productId: string; quantity: string }[] }, excludeId?: string) {
    if (!item.sourceRequestId) return;
    const eligible = await eligibleRequest(tx, user, item.sourceRequestId, excludeId);
    if (eligible.destinationBranchId && eligible.destinationBranchId !== item.destinationBranchId) invalid("A request-linked return must go to its original producing workshop.", 409);
    for (const line of item.lines) if (minor(line.quantity) > minor(eligible.lines.find(row => row.productId === line.productId)?.quantity ?? "0")) invalid("Return exceeds confirmed receiving less other submitted/processed returns for this request.", 409);
}
export async function createReturn(user: CurrentUser, input: ReturnCreate) {
    if (user.roleCode !== "INV") throw new PermissionDeniedError("Sales branch inventory creates stock returns.");
    return prisma.$transaction(async tx => {
        await lockBranches(tx, [user.branchId, input.destinationBranchId]); const source = await returnActor(tx, user);
        const destination = await tx.branch.findUnique({ where: { id: input.destinationBranchId } });
        if (source?.type !== "SALES" || !destination?.isActive || destination.type !== "BAKERY") throw new PermissionDeniedError("Return must go from your sales branch to an active workshop.");
        if (input.sourceRequestId) await lockRequest(tx, input.sourceRequestId);
        const value = await normalize(tx, input), payload = { destinationBranchId: input.destinationBranchId, sourceRequestId: input.sourceRequestId ?? null, businessDate: value.date.toISOString(), note: value.note, condition: "SALEABLE", lines: value.lines }, digest = hash(payload);
        const existing = await tx.stockReturn.findUnique({ where: { clientRequestId: input.clientRequestId } });
        if (existing) { if (existing.createdById !== user.id || existing.sourceBranchId !== user.branchId) throw new PermissionDeniedError("Create token belongs to another user."); if (existing.createHash !== digest) invalid("Create token was already used with different return data.", 409); return view(tx, existing.id); }
        await validateLink(tx, user, { ...input, lines: value.lines });
        const item = await tx.stockReturn.create({ data: { clientRequestId: input.clientRequestId, createHash: digest, sourceBranchId: user.branchId, destinationBranchId: input.destinationBranchId, sourceRequestId: input.sourceRequestId, businessDate: value.date, note: value.note, createdById: user.id, lines: { create: value.lines } } });
        await event(tx, item, user, "CREATED", value.note, payload); return view(tx, item.id);
    }, { timeout: 15_000, isolationLevel: "ReadCommitted" });
}
async function retry(tx: Tx, id: string, user: CurrentUser, clientRequestId: string, digest: string) {
    const prior = await tx.stockReturnEvent.findUnique({ where: { clientRequestId } });
    if (!prior) return false;
    if (prior.returnId !== id || prior.actorId !== user.id || prior.payloadHash !== digest) invalid("Operation token was already used with different data.", 409);
    return true;
}
export async function saveReturn(user: CurrentUser, id: string, input: ReturnSave, editorToken?: string) {
    return locked(user, id, async (tx, item) => {
        authorize(user, item, "save"); await requireDocumentLease(tx, `return:${id}`, user, editorToken);
        const value = await normalize(tx, input), payload = { businessDate: value.date.toISOString(), note: value.note, condition: "SALEABLE", lines: value.lines }, digest = hash({ id, action: "save", ...payload });
        if (await retry(tx, id, user, input.clientRequestId, digest)) return view(tx, id);
        if (item.status !== "DRAFT" || item.version !== input.version) invalid("Return changed or is no longer a draft. Close and reopen it; your changes were not saved.", 409);
        await validateLink(tx, user, { sourceRequestId: item.sourceRequestId, destinationBranchId: item.destinationBranchId, lines: value.lines }, id);
        await tx.stockReturnLine.deleteMany({ where: { returnId: id } });
        const updated = await tx.stockReturn.update({ where: { id }, data: { note: value.note, businessDate: value.date, lines: { create: value.lines }, version: { increment: 1 } } });
        await event(tx, updated, user, "SAVED", value.note, payload, input.clientRequestId, digest); return view(tx, id);
    });
}
async function stockChange(tx: Tx, item: Item, user: CurrentUser, rows: { productId: string; quantity: string }[], kind: "RETURN_DISPATCH" | "RETURN_RECEIVING" | "RETURN_RESTORE", token: string, note: string) {
    const branchId = kind === "RETURN_RECEIVING" ? item.destinationBranchId : item.sourceBranchId, now = new Date();
    for (const line of rows) {
        const delta = minor(line.quantity) * (kind === "RETURN_DISPATCH" ? -BigInt(1) : BigInt(1)), key = { branchId, productId: line.productId };
        const current = await tx.branchStockBalance.findUnique({ where: { branchId_productId: key } }), next = minor(current?.quantity.toString() ?? "0") + delta;
        if (next < BigInt(0)) invalid("The branch does not have enough stock to dispatch this return. No stock changed.", 409);
        if (next > BigInt("999999999999999999")) invalid("Stock would exceed the supported range.", 409);
        await tx.branchStockBalance.upsert({ where: { branchId_productId: key }, create: { ...key, quantity: amount(next), revision: 1 }, update: { quantity: amount(next), revision: { increment: 1 } } });
        await tx.stockMovement.create({ data: { ...key, returnId: item.id, sourceKey: `return:${item.id}:${token}:${line.productId}`, kind, quantityDelta: amount(delta), businessDate: kind === "RETURN_DISPATCH" ? item.businessDate : new Date(now.toISOString().slice(0, 10)), actorId: user.id, postedAt: now, reason: note } });
    }
}
export async function actOnReturn(user: CurrentUser, id: string, action: Action, input: ReturnAction, editorToken?: string) {
    if (!["submit", "review", "dispatch", "receive", "restore", "cancel"].includes(action)) invalid("Unknown return action.");
    return locked(user, id, async (tx, item) => {
        authorize(user, item, action); await requireDocumentLease(tx, `return:${id}`, user, editorToken);
        if (input.condition !== "SALEABLE") invalid("Only saleable goods can be restored to available stock. Use the waste workflow for damaged/expired goods.");
        const rows = (input.lines ?? []).map(line => ({ productId: line.productId, quantity: amount(minor(line.quantity)) })).sort((a, b) => a.productId.localeCompare(b.productId));
        const digest = hash({ id, action, reason: input.reason.trim(), condition: input.condition, lines: rows });
        if (await retry(tx, id, user, input.clientRequestId, digest)) return view(tx, id);
        if (item.version !== input.version) invalid("This return changed in another page. Close and reopen it; your action was not applied.", 409);
        if (input.reason.trim().length < 5 || input.reason.trim().length > 1000) invalid("Enter a reason of 5 to 1000 characters.");
        let status = item.status;
        if (action === "submit" || action === "dispatch") await normalize(tx, { condition: input.condition, businessDate: item.businessDate.toISOString().slice(0, 10), note: item.note, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) });
        if (["submit", "cancel"].includes(action)) {
            if (item.status !== "DRAFT") invalid("Only a draft can be submitted or cancelled.", 409);
            if (action === "submit") await validateLink(tx, user, { sourceRequestId: item.sourceRequestId, destinationBranchId: item.destinationBranchId, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) }, id);
            status = action === "submit" ? "SUBMITTED" : "CANCELLED";
        } else if (["review", "dispatch"].includes(action)) {
            if (item.status !== "SUBMITTED") invalid("Only submitted returns can be reviewed or dispatched.", 409);
            if (action === "dispatch") {
                // Capacity belongs to the source branch, even though a manager performs this action.
                await validateLink(tx, user, { sourceRequestId: item.sourceRequestId, destinationBranchId: item.destinationBranchId, lines: item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })) }, id);
                await stockChange(tx, item, user, item.lines.map(line => ({ productId: line.productId, quantity: line.quantity.toString() })), "RETURN_DISPATCH", "dispatch", input.reason.trim()); status = "DISPATCHED";
            } else status = "DRAFT";
        } else {
            if (item.status !== "DISPATCHED") invalid("Only goods outstanding in return transit can be received or restored.", 409);
            const applied = allocateReturn(amounts(item), rows);
            for (const line of applied) {
                const original = item.lines.find(row => row.productId === line.productId);
                if (!original) invalid("Return product not found.", 409);
                if (["PCS", "BOX"].includes(original.product.unit) && minor(line.quantity) % BigInt(1000) !== BigInt(0)) invalid("Pieces and boxes need whole quantities.");
                const field = action === "receive" ? "receivedQuantity" : "restoredQuantity";
                await tx.stockReturnLine.update({ where: { returnId_productId: { returnId: id, productId: line.productId } }, data: { [field]: amount(minor(original[field].toString()) + minor(line.quantity)) } });
            }
            await stockChange(tx, item, user, applied, action === "receive" ? "RETURN_RECEIVING" : "RETURN_RESTORE", input.clientRequestId, input.reason.trim());
            status = returnStatus(amounts(await view(tx, id)));
        }
        if (!["receive", "restore"].includes(action) && rows.length) invalid("This action uses the saved return quantities. Do not submit replacement rows.");
        const updated = await tx.stockReturn.update({ where: { id }, data: { status, version: { increment: 1 }, ...(action === "dispatch" ? { dispatchedAt: new Date(), dispatchedById: user.id } : {}) } });
        await event(tx, updated, user, action.toUpperCase(), input.reason.trim(), { condition: "SALEABLE", lines: rows }, input.clientRequestId, digest); return view(tx, id);
    });
}
export async function returnLease(user: CurrentUser, id: string, token: string, action: "acquire" | "renew" | "release") {
    return locked(user, id, async (tx, item) => {
        if (action === "release") {
            const allowed = user.roleCode === "INV" && [item.sourceBranchId, item.destinationBranchId].includes(user.branchId) || user.roleCode === "BM" && user.branchId === item.sourceBranchId;
            if (!allowed) throw new PermissionDeniedError("Your role cannot edit this return.");
        } else if (item.status === "DRAFT") authorize(user, item, "save");
        else if (item.status === "SUBMITTED") authorize(user, item, "review");
        else if (item.status === "DISPATCHED") authorize(user, item, user.branchId === item.destinationBranchId ? "receive" : "restore");
        else invalid("This return is finished and read-only.", 409);
        return { ...await changeDocumentLease(tx, `return:${id}`, user, token, action), version: item.version };
    });
}
export async function returnDetail(user: CurrentUser, id: string) { return prisma.$transaction(async tx => { await returnActor(tx, user); const item = await tx.stockReturn.findUnique({ where: { id }, include: detail }); if (!item) missing(); returnScope(user, item); return item; }); }
export async function returnList(user: CurrentUser, page: number, showFinished = false, reference?: string) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) invalid("Invalid return page.");
    const number = reference ? parseTrackingCode("RTN", reference) : null; if (reference && number === null) invalid("Enter a valid RTN code.");
    return prisma.$transaction(async tx => {
        await returnActor(tx, user);
        const where: Prisma.StockReturnWhereInput = { ...(user.roleCode === "ADMIN" ? {} : { OR: [{ sourceBranchId: user.branchId }, { destinationBranchId: user.branchId }] }), ...(!showFinished ? { status: { in: ["DRAFT", "SUBMITTED", "DISPATCHED"] } } : {}), ...(number !== null ? { trackingNumber: number } : {}) };
        const [items, totalItems] = await Promise.all([tx.stockReturn.findMany({ where, include: detail, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), tx.stockReturn.count({ where })]); return { items, totalItems, pageSize: 20 };
    }, { isolationLevel: "RepeatableRead" });
}
export async function returnOptions(user: CurrentUser) {
    return prisma.$transaction(async tx => {
        const location = await returnActor(tx, user), creating = user.roleCode === "INV" && location?.type === "SALES";
        const products = await tx.product.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, displayName: true, unit: true, isActive: true } });
        const destinations = creating ? await tx.branch.findMany({ where: { isActive: true, type: "BAKERY" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }) : [];
        const closed = creating ? await tx.dailyRequest.findMany({ where: { branchId: user.branchId, status: "CLOSED", deletedAt: null, stockReceipt: { is: { status: "CONFIRMED" } } }, select: { id: true, trackingNumber: true }, orderBy: { createdAt: "desc" } }) : [];
        const requests: { id: string; trackingNumber: number; destinationBranchId: string | null; lines: { productId: string; quantity: string }[] }[] = [];
        for (const request of closed) { const eligible = await eligibleRequest(tx, user, request.id); const lines = eligible.lines.filter(line => minor(line.quantity) > BigInt(0)); if (lines.length) requests.push({ id: request.id, trackingNumber: request.trackingNumber, destinationBranchId: eligible.destinationBranchId, lines }); }
        return { creating, products, destinations, requests };
    }, { timeout: 15_000, isolationLevel: "RepeatableRead" });
}
