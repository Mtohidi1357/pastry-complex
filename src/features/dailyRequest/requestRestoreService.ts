import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import { AppError } from "@/errors/AppError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { DuplicateBusinessDateRequestError } from "@/errors/DuplicateDailyRequestError";
import { ApiErrorCode } from "@/types/api";
import { dailyRequestRepository } from "./dailyRequestRepository";
import { lockRequestRow } from "./withRequestEditLease";
import { assertRestoreAccess, getRestorePermission } from "./requestRestorePolicy";

export async function listDeletedRequests(user: CurrentUser, page: number) {
    assertRestoreAccess(user);
    const pageSize = 20;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) {
        throw new AppError(ApiErrorCode.VALIDATION_ERROR, "Invalid page number.", 400);
    }
    const where: Prisma.DailyRequestWhereInput = {
        deletedAt: { not: null },
        ...(user.roleCode === Roles.BM ? { branchId: user.branchId } : {}),
    };
    const [items, totalItems] = await prisma.$transaction([
        prisma.dailyRequest.findMany({
            where, skip: (page - 1) * pageSize, take: pageSize,
            orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
            select: {
                id: true, trackingNumber: true, businessDate: true, status: true, branchId: true,
                deletedAt: true, deletedById: true, assignedToId: true,
                branch: { select: { name: true } },
                assignedTo: { select: { username: true, trackingNumber: true } },
                deletedBy: { select: { username: true, trackingNumber: true } },
            },
        }),
        prisma.dailyRequest.count({ where }),
    ]);
    return { items, totalItems, page, pageSize };
}

export async function restoreRequest(requestId: string, user: CurrentUser) {
    assertRestoreAccess(user);
    // Resolve only the branch before the transaction. State and permission are
    // rechecked under locks before any write.
    const initial = await prisma.dailyRequest.findUnique({ where: { id: requestId }, select: { branchId: true } });
    if (!initial) throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
    if (user.roleCode === Roles.BM && initial.branchId !== user.branchId) {
        throw new PermissionDeniedError("You cannot restore requests from another branch.");
    }
    return prisma.$transaction(async tx => {
        // Same lock as create(): restoration and creation cannot both make a
        // request active for the same branch/day.
        const branches = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM branches WHERE id = ${initial.branchId} FOR UPDATE
        `;
        if (branches.length === 0) throw new AppError(ApiErrorCode.NOT_FOUND, "Branch not found.", 404);
        await lockRequestRow(tx, requestId);
        const request = await tx.dailyRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
        if (request.branchId !== initial.branchId) {
            throw new AppError(ApiErrorCode.VALIDATION_ERROR, "Request changed. Refresh before restoring.", 409);
        }
        if (!request.deletedAt) {
            throw new AppError(ApiErrorCode.VALIDATION_ERROR, "This request has already been restored or is not deleted.", 409);
        }
        const permission = getRestorePermission(request, user);
        if (!permission.allowed) throw new PermissionDeniedError(permission.reason);
        const duplicate = await dailyRequestRepository.findActiveByBranchAndBusinessDate(tx, request.branchId, request.businessDate);
        if (duplicate) throw new DuplicateBusinessDateRequestError();
        const restoredAt = new Date();
        await tx.dailyRequest.update({
            where: { id: request.id },
            data: { deletedAt: null, deletedById: null, lastActionAt: restoredAt },
        });
        // Deleted requests have no editable session to resume.
        await tx.requestEditLease.deleteMany({ where: { dailyRequestId: request.id } });
        const history = await tx.workflowHistory.create({
            data: {
                dailyRequestId: request.id, userId: user.id,
                fromStatus: request.status, toStatus: request.status,
                action: "RESTORE_REQUEST", changedAt: restoredAt,
                note: "Restored from soft deletion; workflow status and assignment preserved.",
            },
            select: { id: true, changedAt: true },
        });
        return { id: request.id, status: request.status, assignedToId: request.assignedToId, restoredAt: history.changedAt };
    }, { timeout: 10_000 });
}
