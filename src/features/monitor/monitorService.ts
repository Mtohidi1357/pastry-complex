import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "../auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { monitorFilters } from "./monitorQuery";

export function requireMonitor(user: CurrentUser) {
    if (user.roleCode !== Roles.ADMIN) throw new PermissionDeniedError("This monitor is available only to administrators.");
}
const identity = { select: { id: true, username: true } } as const;
const summary = {
    id: true, businessDate: true, status: true, branchId: true, assignedToId: true,
    createdAt: true, updatedAt: true, submittedAt: true, approvedAt: true, completedAt: true,
    reportedAt: true, cancelledAt: true, deletedAt: true, lastActionAt: true,
    branch: { select: { id: true, code: true, name: true } },
    createdBy: identity, assignedTo: identity, deletedBy: identity,
} as const;
export async function monitorRequests(user: CurrentUser, params: URLSearchParams) {
    requireMonitor(user);
    const { where, page, pageSize } = monitorFilters(params);
    const [items, totalItems] = await prisma.$transaction([
        prisma.dailyRequest.findMany({ where, select: summary, orderBy: [{ businessDate: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        prisma.dailyRequest.count({ where }),
    ]);
    return { items, totalItems, page, pageSize };
}
export async function monitorOptions(user: CurrentUser) {
    requireMonitor(user);
    const [branches, users] = await prisma.$transaction([
        prisma.branch.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, isActive: true } }),
        prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true, isActive: true } }),
    ]);
    return { branches, users };
}
export async function monitorDetail(user: CurrentUser, id: string) {
    requireMonitor(user);
    const request = await prisma.dailyRequest.findUnique({ where: { id }, select: {
        ...summary,
        lines: { orderBy: { id: "asc" }, select: {
            id: true, previousBalance: true, currentBalance: true, requestedQty: true, producedQty: true, receivedQty: true,
            reportTime: true, managerNote: true, workshopNote: true,
            product: { select: { code: true, displayName: true } },
        } },
        history: { orderBy: [{ changedAt: "asc" }, { id: "asc" }], select: {
            id: true, action: true, changedAt: true, fromStatus: true, toStatus: true, note: true, user: identity,
        } },
    } });
    if (!request) throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
    return request;
}
