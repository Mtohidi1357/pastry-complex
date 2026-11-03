import type { CurrentUser } from "../auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";

export function canViewStock(role?: string) { return role === Roles.INV || role === Roles.BM || role === Roles.ADMIN; }
export function stockScope(user: CurrentUser, branchId?: string): { branchId?: string } {
    if (!canViewStock(user.roleCode)) throw new PermissionDeniedError("Your role cannot access branch stock.");
    if (user.roleCode === Roles.ADMIN) return branchId ? { branchId } : {};
    if (!user.branchId || (branchId && branchId !== user.branchId)) throw new PermissionDeniedError("You cannot access stock from another branch.");
    return { branchId: user.branchId };
}
export function assertStockWrite(user: CurrentUser, action: "receive" | "reverse") {
    if ((action === "receive" ? user.roleCode !== Roles.INV : user.roleCode !== Roles.BM) || !user.branchId) {
        throw new PermissionDeniedError(action === "receive" ? "Only inventory users can create and confirm manual receipts." : "Only branch managers can reverse receipts.");
    }
}
