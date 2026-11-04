import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { catalogAdmin } from "./catalogHttp";
import type { ProductInput } from "./catalogValidation";
import { inspectProductImage } from "./productImage";

type Tx = Prisma.TransactionClient;
const select = {
    id: true, code: true, name: true, displayName: true, unit: true, categoryId: true, barcode: true, notes: true,
    isActive: true, productionOrder: true, sortOrder: true, catalogVersion: true, createdAt: true, updatedAt: true,
    category: { select: { id: true, code: true, displayName: true, isActive: true } }, image: { select: { updatedAt: true } },
} satisfies Prisma.ProductSelect;
type Meta = Prisma.ProductGetPayload<{ select: typeof select }>;
function invalid(message: string, status = 400): never { throw new AppError(ApiErrorCode.VALIDATION_ERROR, message, status); }
function missing(): never { throw new AppError(ApiErrorCode.NOT_FOUND, "Product not found.", 404); }
async function activeAdmin(tx: Tx, user: CurrentUser) {
    catalogAdmin(user);
    if (!await tx.user.findFirst({ where: { id: user.id, isActive: true, role: { is: { code: "ADMIN" } } }, select: { id: true } })) throw new PermissionDeniedError("An active administrator account is required.");
}
function data(input: ProductInput) {
    return { code: input.code, name: input.name, displayName: input.displayName, unit: input.unit, categoryId: input.categoryId,
        barcode: input.barcode || null, notes: input.notes || null, isActive: input.isActive, productionOrder: input.productionOrder, sortOrder: input.sortOrder };
}
function snapshot(product: Meta) {
    return { id: product.id, code: product.code, name: product.name, displayName: product.displayName, unit: product.unit, categoryId: product.categoryId,
        barcode: product.barcode, notes: product.notes, isActive: product.isActive, productionOrder: product.productionOrder, sortOrder: product.sortOrder, version: product.catalogVersion };
}
async function event(tx: Tx, user: CurrentUser, productId: string | null, categoryId: string | null, action: string, message: string, payload: Prisma.InputJsonValue) {
    await tx.catalogEvent.create({ data: { productId, categoryId, actorId: user.id, action, message, payload } });
}
async function category(tx: Tx, input: ProductInput, previous?: Meta) {
    const selected = await tx.productCategory.findUnique({ where: { id: input.categoryId }, select: { id: true, isActive: true } });
    if (!selected || (!selected.isActive && (!previous || previous.categoryId !== selected.id || (!previous.isActive && input.isActive)))) invalid("Choose an active product category.");
}
function view(tx: Tx, id: string) { return tx.product.findUniqueOrThrow({ where: { id }, select }); }
async function locked<T>(user: CurrentUser, id: string, version: number, action: (tx: Tx, previous: Meta) => Promise<T>) {
    catalogAdmin(user);
    return prisma.$transaction(async tx => {
        await activeAdmin(tx, user);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) missing();
        const product = await view(tx, id);
        if (product.catalogVersion !== version) invalid("Product changed in another page. Close and reopen it before continuing.", 409);
        return action(tx, product);
    }, { isolationLevel: "ReadCommitted" });
}
export async function createProduct(user: CurrentUser, input: ProductInput) {
    catalogAdmin(user);
    return prisma.$transaction(async tx => {
        await activeAdmin(tx, user); await category(tx, input);
        const product = await tx.product.create({ data: data(input), select });
        await event(tx, user, product.id, null, "PRODUCT_CREATED", `Created ${product.code} · ${product.displayName} (${product.unit}).`, { after: snapshot(product) });
        return product;
    });
}
export async function updateProduct(user: CurrentUser, id: string, input: ProductInput & { version: number }) {
    return locked(user, id, input.version, async (tx, previous) => {
        if (input.code !== previous.code || input.unit !== previous.unit) invalid("Product codes and units are fixed after creation. Create a separate SKU for a different unit.", 409);
        await category(tx, input, previous);
        const next = data(input);
        const changed = (Object.keys(next) as (keyof typeof next)[]).filter(key => next[key] !== previous[key]);
        if (!changed.length) return previous;
        const product = await tx.product.update({ where: { id }, data: { ...next, catalogVersion: { increment: 1 } }, select });
        await event(tx, user, id, null, "PRODUCT_UPDATED", `Updated ${product.code}: ${changed.map(key => ({ code: "code", name: "name", displayName: "display name", unit: "unit", categoryId: "category", barcode: "barcode", notes: "notes", isActive: "availability", productionOrder: "production order", sortOrder: "display order" })[key]).join(", ")}.`, { before: snapshot(previous), after: snapshot(product) });
        return product;
    });
}
export async function uploadProductImage(user: CurrentUser, id: string, version: number, bytes: Uint8Array) {
    catalogAdmin(user); const mime = inspectProductImage(bytes);
    return locked(user, id, version, async (tx, previous) => {
        await tx.productImage.upsert({ where: { productId: id }, create: { productId: id, data: new Uint8Array(bytes), mime, updatedById: user.id }, update: { data: new Uint8Array(bytes), mime, updatedById: user.id } });
        const product = await tx.product.update({ where: { id }, data: { catalogVersion: { increment: 1 } }, select });
        await event(tx, user, id, null, "PHOTO_UPDATED", `Updated photo for ${previous.code}.`, { mime, bytes: bytes.byteLength, version: product.catalogVersion });
        return product;
    });
}
export async function removeProductImage(user: CurrentUser, id: string, version: number) {
    return locked(user, id, version, async (tx, previous) => {
        if (!previous.image) return previous;
        await tx.productImage.deleteMany({ where: { productId: id } });
        const product = await tx.product.update({ where: { id }, data: { catalogVersion: { increment: 1 } }, select });
        await event(tx, user, id, null, "PHOTO_REMOVED", `Removed photo for ${previous.code}.`, { version: product.catalogVersion });
        return product;
    });
}
export async function productDetail(user: CurrentUser, id: string) {
    catalogAdmin(user);
    return prisma.$transaction(async tx => {
        await activeAdmin(tx, user);
        const product = await tx.product.findUnique({ where: { id }, select }); if (!product) missing();
        const events = await tx.catalogEvent.findMany({ where: { productId: id }, take: 30, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, action: true, message: true, createdAt: true, actor: { select: { username: true } } } });
        return { ...product, events };
    });
}
export async function listProducts(user: CurrentUser, page: number, includeInactive = false, categoryId?: string, q?: string) {
    catalogAdmin(user);
    const where: Prisma.ProductWhereInput = { ...(!includeInactive ? { isActive: true } : {}), ...(categoryId ? { categoryId } : {}), ...(q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { displayName: { contains: q } }, { barcode: { contains: q } }] } : {}) };
    return prisma.$transaction(async tx => {
        await activeAdmin(tx, user);
        const [items, totalItems] = await Promise.all([tx.product.findMany({ where, select, orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { id: "asc" }], skip: (page - 1) * 12, take: 12 }), tx.product.count({ where })]);
        return { items, totalItems, page, pageSize: 12 };
    }, { isolationLevel: "RepeatableRead" });
}
export async function catalogOptions(user: CurrentUser) {
    catalogAdmin(user);
    return prisma.$transaction(async tx => { await activeAdmin(tx, user); return tx.productCategory.findMany({ orderBy: [{ displayOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, displayName: true, isActive: true } }); });
}
export async function createCategory(user: CurrentUser, input: { code: string; name: string; displayName: string }) {
    catalogAdmin(user);
    return prisma.$transaction(async tx => {
        await activeAdmin(tx, user);
        const category = await tx.productCategory.create({ data: { ...input, isActive: true }, select: { id: true, code: true, displayName: true, isActive: true } });
        await event(tx, user, null, category.id, "CATEGORY_CREATED", `Created category ${category.code} · ${category.displayName}.`, { code: category.code, displayName: category.displayName });
        return category;
    });
}
export async function productImage(user: CurrentUser, id: string) {
    if (!["ADMIN", "INV", "BM", "WM"].includes(user.roleCode)) throw new PermissionDeniedError("Sign in to view product photos.");
    const active = await prisma.user.findFirst({ where: { id: user.id, isActive: true, role: { is: { code: user.roleCode } } }, select: { id: true } });
    if (!active) throw new PermissionDeniedError("An active account is required.");
    const image = await prisma.productImage.findUnique({ where: { productId: id }, select: { data: true, mime: true } });
    if (!image) throw new AppError(ApiErrorCode.NOT_FOUND, "Product photo not found.", 404);
    return image;
}
