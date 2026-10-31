import type { CurrentUser } from "@/features/auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";

export type RequestReadScope = {
    deletedAt: null;
    branchId?: string;
    assignedToId?: string;
};

// Only trusted identity fields determine visibility. URL filters can narrow it,
// never replace it. This matches the individual-request canView policy.
export function getRequestReadScope(user: CurrentUser): RequestReadScope {
    if (!user?.id) throw new PermissionDeniedError("A signed-in user is required.");
    switch (user.roleCode) {
        case Roles.ADMIN:
            return { deletedAt: null };
        case Roles.INV:
        case Roles.BM:
            if (!user.branchId) throw new PermissionDeniedError("Your account has no branch.");
            return { deletedAt: null, branchId: user.branchId };
        case Roles.WM:
            return { deletedAt: null, assignedToId: user.id };
        default:
            throw new PermissionDeniedError("Your role cannot view requests.");
    }
}

export function assertBranchFilterAllowed(user: CurrentUser, branchId?: string) {
    const scope = getRequestReadScope(user);
    if (branchId && scope.branchId && branchId !== scope.branchId) {
        throw new PermissionDeniedError("You cannot request data for another branch.");
    }
    return scope;
}
