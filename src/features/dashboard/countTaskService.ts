import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";

export async function managerCountTasks(user: CurrentUser, page: number, showFinished = false) {
    if (user.roleCode !== "BM") throw new PermissionDeniedError("Count approval tasks are available to branch managers.");
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) throw new AppError(ApiErrorCode.VALIDATION_ERROR, "Invalid task page.", 400);
    // Counts are reviewed by eligible managers in their branch, not assigned to a single manager.
    const due: Prisma.StockCountWhereInput = { status: "SUBMITTED", createdById: { not: user.id } };
    const where: Prisma.StockCountWhereInput = { branchId: user.branchId, ...(showFinished ? { OR: [due, { status: "APPROVED" }] } : due) };
    return prisma.$transaction(async tx => {
        const active = await tx.user.findFirst({ where: { id: user.id, branchId: user.branchId, isActive: true,
            role: { is: { code: "BM" } }, branch: { is: { isActive: true, type: "SALES" } } }, select: { id: true } });
        if (!active) throw new PermissionDeniedError("An active branch manager account in an active sales branch is required.");
        const [items, totalItems] = await Promise.all([
            tx.stockCount.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { id: true, trackingNumber: true, kind: true, status: true, businessDate: true, createdAt: true,
                    createdBy: { select: { username: true, trackingNumber: true } }, branch: { select: { code: true } } } }),
            tx.stockCount.count({ where }),
        ]);
        return { items, totalItems, page, pageSize: 20 };
    }, { isolationLevel: "RepeatableRead" });
}
