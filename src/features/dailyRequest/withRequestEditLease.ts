import { prisma } from "@/lib/prisma";
import type { DailyRequest, Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/features/auth/authTypes";
import { AppError } from "@/errors/AppError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { ApiErrorCode } from "@/types/api";
import { Roles } from "@/lib/constants/roles";

export async function lockRequestRow(
    tx: Prisma.TransactionClient,
    requestId: string,
) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM daily_requests
        WHERE id = ${requestId}
        FOR UPDATE
    `;
    if (rows.length === 0) {
        throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
    }
}

// Request writes lock their parent row; stock-posting closes first lock the branch.
// The callback must use tx for every database access involved in the write.
export async function withRequestEditLease<T>(
    requestId: string,
    currentUser: CurrentUser,
    editorToken: string | undefined,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    releaseOnSuccess = false,
    authorize?: (request: DailyRequest) => void,
    lockBranchFirst = false,
): Promise<T> {
    if (currentUser.roleCode === Roles.ADMIN) {
        throw new PermissionDeniedError("Administrators can monitor requests and restore soft-deleted requests, but cannot edit or perform workflow actions.");
    }
    const initial = lockBranchFirst
        ? await prisma.dailyRequest.findUnique({ where: { id: requestId }, select: { branchId: true } })
        : null;
    if (lockBranchFirst && !initial) throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
    return prisma.$transaction(async (tx) => {
        if (initial) {
            const branches = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM branches WHERE id = ${initial.branchId} FOR UPDATE`;
            if (!branches.length) throw new AppError(ApiErrorCode.NOT_FOUND, "Branch not found.", 404);
        }
        await lockRequestRow(tx, requestId);
        const request = await tx.dailyRequest.findUnique({ where: { id: requestId } });
        if (!request || request.deletedAt) {
            throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
        }
        if (initial && request.branchId !== initial.branchId) {
            throw new AppError(ApiErrorCode.VALIDATION_ERROR, "Request changed. Refresh before closing.", 409);
        }
        if (request.assignedToId !== currentUser.id ||
            (currentUser.roleCode !== Roles.WM && request.branchId !== currentUser.branchId)) {
            throw new PermissionDeniedError("This request is not assigned to you in a permitted branch.");
        }
        // Authorization must precede lease errors, under the same row lock.
        authorize?.(request);
        if (!editorToken) {
            throw new AppError(
                ApiErrorCode.EDIT_LEASE_CONFLICT,
                "Open this request in an editor before making changes.",
                409,
            );
        }
        const lease = await tx.requestEditLease.findUnique({
            where: { dailyRequestId: requestId },
        });
        if (!lease || lease.ownerId !== currentUser.id || lease.token !== editorToken ||
            lease.expiresAt.getTime() <= Date.now()) {
            throw new AppError(
                ApiErrorCode.EDIT_LEASE_CONFLICT,
                "Your editing session expired or is no longer active. Close and reopen this editor.",
                409,
            );
        }
        const result = await operation(tx);
        if (releaseOnSuccess) {
            await tx.requestEditLease.deleteMany({
                where: { dailyRequestId: requestId, ownerId: currentUser.id, token: editorToken },
            });
        }
        return result;
    }, { timeout: 10000 });
}
