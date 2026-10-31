import type { CurrentUser } from "@/features/auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";

export function canCreateRequests(roleCode?: string): boolean {
    return roleCode === Roles.INV || roleCode === Roles.BM;
}

export function assertCanCreateRequest(user: CurrentUser, branchId: string) {
    if (!user?.id || !canCreateRequests(user.roleCode)) {
        throw new PermissionDeniedError("Only inventory users and branch managers can create requests.");
    }
    if (!user.branchId || branchId !== user.branchId) {
        throw new PermissionDeniedError("You can only create requests for your own branch.");
    }
}
