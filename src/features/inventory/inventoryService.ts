import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { invalid } from "../stock/stockValidation";
import { returnActor } from "../returns/returnPolicy";
import { inventoryTotals, type TransitLine } from "./inventoryTotals";

type Query = { view: "balances" | "transit" | "movements"; page: number; branchId?: string; productId?: string; locationType?: "SALES" | "BAKERY"; includeZero?: boolean };
const location = { id: true, code: true, name: true, type: true, isActive: true } as const;
const identity = { id: true, username: true, trackingNumber: true } as const;
const reference = { id: true, trackingNumber: true } as const;
export async function inventoryOptions(user: CurrentUser) {
    return prisma.$transaction(async tx => {
        await returnActor(tx, user);
        const [branches, products] = await Promise.all([
            tx.branch.findMany({ where: { type: { in: ["SALES", "BAKERY"] }, ...(user.roleCode === "ADMIN" ? {} : { id: user.branchId }) }, orderBy: { code: "asc" }, select: location }),
            tx.product.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, displayName: true, unit: true } }),
        ]); return { canSeeAll: user.roleCode === "ADMIN", branches, products };
    });
}
export async function inventoryReport(user: CurrentUser, query: Query) {
    if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 100_000) invalid("Invalid inventory page.");
    if (user.roleCode !== "ADMIN" && query.branchId && query.branchId !== user.branchId) throw new PermissionDeniedError("You may monitor only your own location.");
    if (user.roleCode !== "ADMIN" && query.locationType) throw new PermissionDeniedError("Only admin can filter across location types.");
    return prisma.$transaction(async tx => {
        await returnActor(tx, user);
        const branches = await tx.branch.findMany({ where: { type: query.locationType ? query.locationType : { in: ["SALES", "BAKERY"] }, ...(user.roleCode === "ADMIN" ? query.branchId ? { id: query.branchId } : {} : { id: user.branchId }) }, select: location, orderBy: { code: "asc" } });
        const ids = branches.map(branch => branch.id), where: Prisma.StockMovementWhereInput = { branchId: { in: ids }, ...(query.productId ? { productId: query.productId } : {}) }, pageSize = 25;
        if (query.view === "movements") {
            const [items, totalItems] = await Promise.all([
                tx.stockMovement.findMany({ where, skip: (query.page - 1) * pageSize, take: pageSize, orderBy: [{ postedAt: "desc" }, { id: "asc" }], include: { branch: { select: location }, product: { select: { code: true, displayName: true, unit: true } }, actor: { select: identity }, salesReport: { select: reference }, stockReturn: { select: reference }, delivery: { select: reference }, stockCount: { select: reference }, receipt: { select: reference }, workshopReceipt: { select: reference } } }),
                tx.stockMovement.count({ where }),
            ]); return { view: query.view, items, totalItems, pageSize, totals: [], branches };
        }
        const productFilter = query.productId ? { productId: query.productId } : {};
        const [products, balances, deliveries, returns] = await Promise.all([
            tx.product.findMany({ where: query.productId ? { id: query.productId } : {}, select: { id: true, code: true, displayName: true, unit: true }, orderBy: { code: "asc" } }),
            tx.branchStockBalance.findMany({ where: { branchId: { in: ids }, ...productFilter }, select: { branchId: true, productId: true, quantity: true } }),
            tx.workshopDeliveryLine.findMany({ where: { ...productFilter, delivery: { is: { status: "DISPATCHED", OR: [{ sourceBranchId: { in: ids } }, { destinationBranchId: { in: ids } }] } } }, include: { delivery: { select: { id: true, trackingNumber: true, businessDate: true, sourceBranch: { select: location }, destinationBranch: { select: location } } } } }),
            tx.stockReturnLine.findMany({ where: { ...productFilter, returnCase: { is: { status: "DISPATCHED", OR: [{ sourceBranchId: { in: ids } }, { destinationBranchId: { in: ids } }] } } }, include: { returnCase: { select: { id: true, trackingNumber: true, businessDate: true, sourceBranch: { select: location }, destinationBranch: { select: location } } } } }),
        ]);
        const flows: TransitLine[] = [
            ...deliveries.map(line => ({ id: line.delivery.id, trackingNumber: line.delivery.trackingNumber, type: "DELIVERY" as const, productId: line.productId, quantity: line.quantity.toString(), received: line.receivedQuantity.toString(), restored: line.returnedQuantity.toString(), sourceBranch: line.delivery.sourceBranch, destinationBranch: line.delivery.destinationBranch, businessDate: line.delivery.businessDate.toISOString() })),
            ...returns.map(line => ({ id: line.returnCase.id, trackingNumber: line.returnCase.trackingNumber, type: "RETURN" as const, productId: line.productId, quantity: line.quantity.toString(), received: line.receivedQuantity.toString(), restored: line.restoredQuantity.toString(), sourceBranch: line.returnCase.sourceBranch, destinationBranch: line.returnCase.destinationBranch, businessDate: line.returnCase.businessDate.toISOString() })),
        ];
        const result = inventoryTotals(products, branches, balances.map(row => ({ ...row, quantity: row.quantity.toString() })), flows, query.includeZero ?? false);
        const rows = query.view === "transit" ? result.transit : result.items;
        return { view: query.view, items: rows.slice((query.page - 1) * pageSize, query.page * pageSize), totalItems: rows.length, pageSize, totals: result.totals, branches };
    }, { timeout: 15_000, isolationLevel: "RepeatableRead" });
}
