import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
export function canViewReturns(role?: string) { return ["INV", "BM", "WM", "ADMIN"].includes(role ?? ""); }
export function returnScope(user: CurrentUser, item: { sourceBranchId: string; destinationBranchId: string }) {
    if (!canViewReturns(user.roleCode) || (user.roleCode !== "ADMIN" && ![item.sourceBranchId, item.destinationBranchId].includes(user.branchId))) throw new PermissionDeniedError("This return does not belong to your location.");
}
export async function returnActor(tx: Prisma.TransactionClient, user: CurrentUser) {
    if (!canViewReturns(user.roleCode)) throw new PermissionDeniedError("Your role cannot access returns or inventory monitoring.");
    const account = await tx.user.findFirst({ where: { id: user.id, branchId: user.branchId, isActive: true, role: { is: { code: user.roleCode } } }, select: { id: true } });
    if (!account) throw new PermissionDeniedError("An active account with your current role and location is required.");
    const location = await tx.branch.findUnique({ where: { id: user.branchId }, select: { id: true, code: true, type: true, isActive: true } });
    if (user.roleCode === "ADMIN") return location;
    if (!location?.isActive || !["SALES", "BAKERY"].includes(location.type) || (user.roleCode === "BM" && location.type !== "SALES") || (user.roleCode === "WM" && location.type !== "BAKERY")) throw new PermissionDeniedError("An active account in the correct sales branch or workshop is required.");
    return location;
}
