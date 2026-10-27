import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/features/auth/authTypes";
import { AppError } from "@/errors/AppError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { ApiErrorCode } from "@/types/api";
import { Roles } from "@/lib/constants/roles";
import { RequestStatus } from "@/generated/prisma/enums";
import { requestPolicy } from "./requestPolicy";

import { lockRequestRow } from "./withRequestEditLease";

type LeaseAction = "acquire" | "renew" | "release";

const LEASE_DURATION_MS = 120_000;
function conflict(message: string) {
    return new AppError(
        ApiErrorCode.EDIT_LEASE_CONFLICT,
        message,
        409,
    );
}
export async function performLeaseAction(
    requestId: string,
    currentUser: CurrentUser,
    editorToken: string,
    action: LeaseAction,
) {
    return prisma.$transaction(async (tx) => {
        await lockRequestRow(tx, requestId);

        const now = new Date();
        // Release requires ownership of the lease, even if the
        // request has since moved to another user or status.
        if (action === "release") {
            await tx.requestEditLease.deleteMany({
                where: {
                    dailyRequestId: requestId,
                    ownerId: currentUser.id,
                    token: editorToken,
                },
            });

            return { released: true };
        }
        const request = await tx.dailyRequest.findUnique({
            where: { id: requestId },
        });

        if (!request || request.deletedAt) {
            throw new AppError(
                ApiErrorCode.NOT_FOUND,
                "Request not found.",
                404,
            );
        }

        if (request.assignedToId !== currentUser.id) {
            throw new PermissionDeniedError(
                "This request is not assigned to you.",
            );
        }
        if (
            currentUser.roleCode !== Roles.WM &&
            request.branchId !== currentUser.branchId
        ) {
            throw new PermissionDeniedError(
                "This request belongs to another branch.",
            );
        }

        const context = { request, currentUser };
        // A workshop manager needs to acquire the lease before
        // transitioning MANAGER_SUBMITTED into production.
        const canStartProduction =
            currentUser.roleCode === Roles.WM &&
            request.status === RequestStatus.MANAGER_SUBMITTED;

        const canEdit =
            requestPolicy.canRequest(context).allowed ||
            requestPolicy.canProduce(context).allowed ||
            requestPolicy.canReceive(context).allowed ||
            canStartProduction;
        if (!canEdit) {
            throw new PermissionDeniedError(
                "This request is not available for editing.",
            );
        }

        const existing = await tx.requestEditLease.findUnique({
            where: { dailyRequestId: requestId },
        });

        const sameEditor =
            existing?.ownerId === currentUser.id &&
            existing?.token === editorToken;
        const isActive =
            existing !== null &&
            existing.expiresAt.getTime() > now.getTime();

        if (action === "renew" && (!sameEditor || !isActive)) {
            throw conflict(
                "Your editing session expired or is no longer active.",
            );
        }

        if (action === "acquire" && isActive && !sameEditor) {
            throw conflict(
                "This request is already open in another editor.",
            );
        }
        const expiresAt = new Date(
            now.getTime() + LEASE_DURATION_MS,
        );
        const lease = await tx.requestEditLease.upsert({
            where: {dailyRequestId: requestId},
            create: {
                dailyRequestId: requestId,
                ownerId: currentUser.id,
                token: editorToken,
                expiresAt,
            },
            update: {
                ownerId: currentUser.id,
                token: editorToken,
                expiresAt,
            },
        });
        return {
            requestId,
            expiresAt: lease.expiresAt,
        };
    });
}

