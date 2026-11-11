import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";

export function canViewCounts(role?: string) { return ["INV", "BM", "WM", "ADMIN"].includes(role ?? ""); }
// Separate from stockPolicy: count access must not grant WM sales receiving/reversal rights.
export function countScope(user: CurrentUser, branchId?: string): { branchId?: string } {
    if (!canViewCounts(user.roleCode)) throw new PermissionDeniedError("Your role cannot view physical stock counts.");
    if (user.roleCode === "ADMIN") return branchId ? { branchId } : {};
    if (!user.branchId || (branchId && branchId !== user.branchId)) throw new PermissionDeniedError("You cannot access another location's stock count.");
    return { branchId: user.branchId };
}
export function requireCountRole(user: CurrentUser, mode: "enter" | "review") {
    if (!user.branchId || (mode === "enter" ? user.roleCode !== "INV" : !["BM", "WM"].includes(user.roleCode))) {
        throw new PermissionDeniedError(mode === "enter" ? "Only inventory users can enter and submit physical counts." : "The sales branch manager or workshop manager for this location must review the count.");
    }
}
export async function countActor(tx: Prisma.TransactionClient, user: CurrentUser, mode: "read" | "enter" | "review" = "read") {
    countScope(user);
    if (mode !== "read") requireCountRole(user, mode);
    const account = await tx.user.findFirst({ where: { id: user.id, branchId: user.branchId, isActive: true, role: { is: { code: user.roleCode } } }, select: { id: true } });
    if (!account) throw new PermissionDeniedError("An active account with your current role and location is required.");
    const branch = await tx.branch.findUnique({ where: { id: user.branchId }, select: { id: true, isActive: true, type: true } });
    if (user.roleCode === "ADMIN" && mode === "read") return branch;
    if (!branch?.isActive || !["SALES", "BAKERY"].includes(branch.type)) throw new PermissionDeniedError("An active sales branch or workshop is required.");
    if ((user.roleCode === "BM" && branch.type !== "SALES") || (user.roleCode === "WM" && branch.type !== "BAKERY")) {
        throw new PermissionDeniedError("Sales counts require a branch manager; workshop counts require a workshop manager belonging to that workshop.");
    }
    return branch;
}
