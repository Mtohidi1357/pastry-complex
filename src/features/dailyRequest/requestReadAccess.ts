import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/features/auth/authTypes";
import { AppError } from "@/errors/AppError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { ApiErrorCode } from "@/types/api";
import { dailyRequestRepository } from "./dailyRequestRepository";
import { requestPolicy } from "./requestPolicy";

export async function requireRequestReadAccess(
    requestId: string,
    currentUser: CurrentUser,
) {
    const request = await dailyRequestRepository.findById(
        prisma,
        requestId,
    );

    if (!request || request.deletedAt) {
        throw new AppError(
            ApiErrorCode.NOT_FOUND,
            "Request not found.",
            404,
        );
    }

    const permission = requestPolicy.canView({
        request,
        currentUser,
    });

    if (!permission.allowed) {
        throw new PermissionDeniedError(permission.reason);
    }

    return request;
}