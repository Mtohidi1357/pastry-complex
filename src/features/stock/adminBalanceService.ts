import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { amount, invalid, minor } from "./stockValidation";

export function requireAdminBalances(user: CurrentUser) {
    if (user.roleCode !== "ADMIN") throw new PermissionDeniedError("The cross-branch balance sheet is available only to administrators.");
}
export async function adminBalances(user: CurrentUser, page: number, branchId?: string, productId?: string) {
    requireAdminBalances(user);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) invalid("Invalid balance-sheet page.");
    const pageSize = 20;
    return prisma.$transaction(async tx => {
        const branchOptions = await tx.branch.findMany({ where: { type: "SALES" }, orderBy: [{ code: "asc" }, { id: "asc" }], select: { id: true, code: true, name: true, isActive: true } });
        if (branchId && !branchOptions.some(branch => branch.id === branchId)) invalid("Choose a sales branch for this balance sheet.");
        const branches = branchId ? branchOptions.filter(branch => branch.id === branchId) : branchOptions;
        const productWhere = productId ? { id: productId } : {};
        const balanceWhere = { branchId: { in: branches.map(branch => branch.id) }, ...(productId ? { productId } : {}) };
        const [products, totalProducts, unitGroups, balances] = await Promise.all([
            tx.product.findMany({ where: productWhere, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { id: "asc" }], select: { id: true, code: true, displayName: true, unit: true, isActive: true } }),
            tx.product.count({ where: productWhere }),
            tx.product.groupBy({ by: ["unit"], where: productWhere, _count: { _all: true } }),
            tx.branchStockBalance.findMany({ where: balanceWhere, select: { branchId: true, productId: true, quantity: true, product: { select: { unit: true } } } }),
        ]);
        const quantities = new Map<string, bigint>(), stocked = new Set<string>();
        const totals = new Map<string, { productCount: number; quantities: Map<string, bigint>; total: bigint }>();
        for (const group of unitGroups) totals.set(group.unit, { productCount: group._count._all, quantities: new Map(), total: BigInt(0) });
        for (const balance of balances) {
            const quantity = minor(balance.quantity.toString());
            quantities.set(`${balance.productId}:${balance.branchId}`, quantity);
            if (quantity !== BigInt(0)) stocked.add(balance.productId);
            const unit = totals.get(balance.product.unit);
            if (!unit) continue;
            unit.quantities.set(balance.branchId, (unit.quantities.get(balance.branchId) ?? BigInt(0)) + quantity);
            unit.total += quantity;
        }
        const items = products.map(product => {
            let total = BigInt(0);
            const branchQuantities = Object.fromEntries(branches.map(branch => {
                const quantity = quantities.get(`${product.id}:${branch.id}`) ?? BigInt(0); total += quantity;
                return [branch.id, amount(quantity)];
            }));
            return { ...product, branchQuantities, total: amount(total) };
        });
        const unitTotals = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([unit, value]) => ({
            unit, productCount: value.productCount, total: amount(value.total),
            branchQuantities: Object.fromEntries(branches.map(branch => [branch.id, amount(value.quantities.get(branch.id) ?? BigInt(0))])),
        }));
        return { items, branches, branchOptions, page, pageSize, totalProducts, productsWithStock: stocked.size, unitTotals };
    }, { isolationLevel: "RepeatableRead" });
}
