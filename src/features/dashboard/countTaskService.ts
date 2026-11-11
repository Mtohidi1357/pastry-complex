import { countActor, requireCountRole } from "../stock/countPolicy";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";

export async function managerCountTasks(user: CurrentUser, page: number, showFinished = false) {
    requireCountRole(user, "review");
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) throw new AppError(ApiErrorCode.VALIDATION_ERROR, "Invalid task page.", 400);
    // Counts are reviewed by eligible managers in their branch, not assigned to a single manager.
    const due: Prisma.StockCountWhereInput = { status: "SUBMITTED", createdById: { not: user.id } };
    const where: Prisma.StockCountWhereInput = { branchId: user.branchId, ...(showFinished ? { OR: [due, { status: "APPROVED" }] } : due) };
    return prisma.$transaction(async tx => {
        await countActor(tx, user, "review");
        const [items, totalItems] = await Promise.all([
            tx.stockCount.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { id: true, trackingNumber: true, kind: true, status: true, businessDate: true, createdAt: true,
                    createdBy: { select: { username: true, trackingNumber: true } }, branch: { select: { code: true } } } }),
            tx.stockCount.count({ where }),
        ]);
        return { items, totalItems, page, pageSize: 20 };
    }, { isolationLevel: "RepeatableRead" });
}
