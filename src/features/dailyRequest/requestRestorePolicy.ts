import type { CurrentUser } from "../auth/authTypes";
import type { DailyRequest } from "@/generated/prisma/client";
import { Roles } from "@/lib/constants/roles";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";

export function canRestoreRequests(roleCode?: string): boolean {
    return roleCode === Roles.ADMIN || roleCode === Roles.BM;
}

export function assertRestoreAccess(user: CurrentUser): void {
    if (!canRestoreRequests(user.roleCode) || (user.roleCode === Roles.BM && !user.branchId)) {
        throw new PermissionDeniedError("Only administrators and branch managers can recover deleted requests.");
    }
}

export function getRestorePermission(request: DailyRequest, user: CurrentUser) {
    if (!request.deletedAt) return { allowed: false, reason: "This request is not deleted." };
    if (!canRestoreRequests(user.roleCode)) return { allowed: false, reason: "Your role cannot restore requests." };
    if (user.roleCode === Roles.BM && (!user.branchId || request.branchId !== user.branchId)) {
        return { allowed: false, reason: "You cannot restore requests from another branch." };
    }
    return { allowed: true };
}
