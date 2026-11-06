import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
export function workshopScope(user: CurrentUser, branchId?: string): { branchId?: string } {
    if (user.roleCode === "ADMIN") return branchId ? { branchId } : {};
    if (!["WM", "INV"].includes(user.roleCode) || !user.branchId || (branchId && branchId !== user.branchId)) throw new PermissionDeniedError("Workshop managers and inventory users can view their workshop stock; admin may monitor it.");
    return { branchId: user.branchId };
}
export function workshopWrite(user: CurrentUser) { if (user.roleCode !== "WM" || !user.branchId) throw new PermissionDeniedError("Only workshop managers can post or correct workshop stock."); }
export async function workshopActor(tx: Prisma.TransactionClient, user: CurrentUser, write = false) {
    if (write) workshopWrite(user); else workshopScope(user);
    const account = await tx.user.findFirst({ where: { id: user.id, isActive: true, role: { is: { code: user.roleCode } }, ...(["WM", "INV"].includes(user.roleCode) ? { branchId: user.branchId } : {}) }, select: { id: true } });
    if (!account) throw new PermissionDeniedError("An active account with your current role and branch is required.");
    if (["WM", "INV"].includes(user.roleCode)) {
        const branch = await tx.branch.findUnique({ where: { id: user.branchId }, select: { isActive: true, type: true } });
        if (!branch?.isActive || branch.type !== "BAKERY") throw new PermissionDeniedError("Your account must belong to an active BAKERY branch.");
    }
}
