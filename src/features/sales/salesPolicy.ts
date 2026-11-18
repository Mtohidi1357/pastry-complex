import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
export function salesScope(user: CurrentUser, item: { branchId: string }) {
    if (!["INV", "BM", "ADMIN"].includes(user.roleCode) || user.roleCode !== "ADMIN" && user.branchId !== item.branchId) throw new PermissionDeniedError("This sales report does not belong to your branch.");
}
export async function salesActor(tx: Prisma.TransactionClient, user: CurrentUser) {
    if (!["INV", "BM", "ADMIN"].includes(user.roleCode)) throw new PermissionDeniedError("Sales are available to sales branch inventory, branch managers and administrators.");
    const account = await tx.user.findFirst({ where: { id: user.id, branchId: user.branchId, isActive: true, role: { is: { code: user.roleCode } } }, select: { id: true } });
    if (!account) throw new PermissionDeniedError("Your active account, role and branch must match your login. Log in again.");
    const branch = await tx.branch.findUnique({ where: { id: user.branchId } });
    if (user.roleCode !== "ADMIN" && (!branch?.isActive || branch.type !== "SALES")) throw new PermissionDeniedError("Daily sales require an active sales branch.");
    return branch;
}
