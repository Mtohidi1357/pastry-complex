import { prisma } from "@/lib/prisma";
import { dashboardRepository } from "./dashboardRepository";
import { RequestStatus } from "@/generated/prisma/enums";
import { branchRepository } from "../branches/branchRepo";
import { dailyRequestRepository } from "../dailyRequest/dailyRequestRepository";
import type { DailyRequestQuery } from "@/validation/dailyRequestQuerySchema";
import type { CurrentUser } from "../auth/authTypes";
import { requestPolicy } from "../dailyRequest/requestPolicy";
import { getRequestReadScope, assertBranchFilterAllowed } from "../dailyRequest/requestReadScope";

export const dashboardService = {
    async getSummary(user: CurrentUser) {
        const scope = getRequestReadScope(user);
        const [draft, inventory, workshop, completedToday, cancelled, completedRequests] = await Promise.all([
            dashboardRepository.countByStatus(prisma, RequestStatus.DRAFT, scope),
            dashboardRepository.countByStatus(prisma, RequestStatus.INVENTORY_SUBMITTED, scope),
            dashboardRepository.countByStatus(prisma, RequestStatus.WORKSHOP_PROCESSING, scope),
            dashboardRepository.countCompletedTody(prisma, new Date(), scope),
            dashboardRepository.countByStatus(prisma, RequestStatus.CANCELLED, scope),
            dashboardRepository.getCompletedRequests(prisma, scope),
        ]);
        const durations = completedRequests.flatMap(item =>
            item.submittedAt && item.completedAt
                ? [(item.completedAt.getTime() - item.submittedAt.getTime()) / 3600000] : []);
        return {
            draftRequests: draft, inventorySubmitted: inventory, workshopProcessing: workshop,
            completedToday, cancelledRequests: cancelled, completedRequests,
            averageCompletionHours: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        };
    },
    async getStatusChartData(user: CurrentUser) {
        const rows = await dashboardRepository.getStatusDistributionChart(prisma, getRequestReadScope(user));
        return rows.map(item => ({ status: item.status, count: item._count.status }));
    },
    async getWorkQueue(user: CurrentUser) {
        const scope = getRequestReadScope(user);
        const [inventoryQueue, managerQueue, waiting, processing] = await Promise.all([
            dashboardRepository.countByStatus(prisma, RequestStatus.DRAFT, scope),
            dashboardRepository.countByStatus(prisma, RequestStatus.INVENTORY_SUBMITTED, scope),
            dashboardRepository.countByStatus(prisma, RequestStatus.MANAGER_SUBMITTED, scope),
            dashboardRepository.countByStatus(prisma, RequestStatus.WORKSHOP_PROCESSING, scope),
        ]);
        return { inventoryQueue, managerQueue, workshopQueue: waiting + processing };
    },
    async getRequestTrend(user: CurrentUser) {
        const scope = getRequestReadScope(user);
        const [created, completed] = await Promise.all([
            dashboardRepository.getCreatedByDate(prisma, scope),
            dashboardRepository.getCompletedByDate(prisma, scope),
        ]);
        const map = new Map<string, { date: string; created: number; completed: number }>();
        for (const row of created) map.set(row.day, { date: row.day, created: row.count, completed: 0 });
        for (const row of completed) {
            const item = map.get(row.day) ?? { date: row.day, created: 0, completed: 0 };
            item.completed = row.count;
            map.set(row.day, item);
        }
        return { trend: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)) };
    },
    async getBranchPerformance(user: CurrentUser) {
        const scope = getRequestReadScope(user);
        const [totals, completed, cancelled] = await Promise.all([
            dashboardRepository.getTotalByBranch(prisma, scope),
            dashboardRepository.getBranchCompleted(prisma, scope),
            dashboardRepository.getBranchCancelled(prisma, scope),
        ]);
        const branches = await branchRepository.getBranchNames(prisma, totals.map(row => row.branchId));
        const names = new Map(branches.map(branch => [branch.id, branch.name]));
        return totals.map(row => ({
            branchId: row.branchId,
            branchName: names.get(row.branchId) ?? "Unknown",
            totalRequests: row._count.branchId,
            completed: completed.find(item => item.branchId === row.branchId)?._count.branchId ?? 0,
            cancelled: cancelled.find(item => item.branchId === row.branchId)?._count.branchId ?? 0,
        }));
    },
    async getInbox(query: DailyRequestQuery, currentUser: CurrentUser) {
        const scope = assertBranchFilterAllowed(currentUser, query.branchId);
        // Assignment is derived from the authenticated actor, never the URL.
        const result = await dailyRequestRepository.findMany(prisma, { ...query, assignedToId: currentUser.id }, scope);
        return {
            ...result,
            items: result.items.map(request => ({
                ...request,
                capabilities: requestPolicy.buildCapabilities({ request, currentUser }),
                salesBranchName: request.branch?.name ?? request.branchId,
            })),
        };
    },
};
