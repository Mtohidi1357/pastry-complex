import { prisma } from "@/lib/prisma"
import { dashboardRepository } from "./dashboardRepository"
import { RequestStatus } from "@/generated/prisma/enums"
import { branchRepository } from "../branches/branchRepo"
import { dailyRequestRepository } from "@/features/dailyRequest/dailyRequestRepository"
import { DailyRequestQuery } from "@/validation/dailyRequestQuerySchema"
import { CurrentUser } from "../auth/authTypes"
import { requestPolicy } from "../dailyRequest/requestPolicy"

interface TrendItem {
    date: Date,
    created: number,
    completed: number
}

interface BranchPerformance {
    branchId: String
    branchName: String,
    totalRequests: number,
    completed: number | undefined,
    cancelled: number | undefined,
}

export const dashboardService = {
    async getSummary() {
        const [
            draft,
            inventory,
            workshop,
            completedToday,
            cancelled,
            completedRequests,
        ] = await Promise.all([

            dashboardRepository.countByStatus(
                prisma,
                RequestStatus.DRAFT
            ),

            dashboardRepository.countByStatus(
                prisma,
                RequestStatus.INVENTORY_SUBMITTED,
            ),

            dashboardRepository.countByStatus(
                prisma,
                RequestStatus.WORKSHOP_PROCESSING,
            ),

            dashboardRepository.countCompletedTody(
                prisma,
                new Date(),
            ),

            dashboardRepository.countByStatus(
                prisma,
                RequestStatus.CANCELLED,
            ),

            dashboardRepository.getCompletedRequests(
                prisma,
            ),
        ]);

        return {
            draftRequests: draft,

            inventorySubmitted: inventory,

            workshopProcessing: workshop,

            completedToday,

            cancelledRequests: cancelled,

            completedRequests,
        }
    },

    async getStatusChartData() {
        const prismaFormatData = await dashboardRepository.getStatusDistributionChart(
            prisma,
        );

        const groupedFormat = prismaFormatData.map(
            item => ({
                status: item.status,
                count: item._count.status
            })
        );

        return groupedFormat;
    },

    async getWorkQueue() {
        const [
            inventoryQueue,
            managerQueue,
            workshopQueue
        ] = await Promise.all([
            dashboardRepository.countByStatus(
                prisma,
                RequestStatus.DRAFT
            ),

            dashboardRepository.countByStatus(
                prisma,
                RequestStatus.INVENTORY_SUBMITTED
            ),

            await dashboardRepository.countByStatus(
                prisma,
                RequestStatus.MANAGER_SUBMITTED,
            ) + await dashboardRepository.countByStatus(
                prisma,
                RequestStatus.WORKSHOP_PROCESSING
            ),
        ]);

        return {
            inventoryQueue,
            managerQueue,
            workshopQueue
        }
    },

    async getRequestTrend() {
        const [
            created,
            completed,
        ] = await Promise.all([
            dashboardRepository.getCreatedByDate(prisma),
            dashboardRepository.getCompletedByDate(prisma),
        ]);

        const trendMap = new Map<Date | null, TrendItem>();
        created.forEach(row => {
            trendMap.set(row.day, {
                date: row.day,
                created: Number(row.count),
                completed: 0,
            })
        });

        completed.forEach(row => {
            const existing = trendMap.get(row.day);

            if (existing) {
                existing.completed = row.count;
            } else {
                trendMap.set(row.day, {
                    date: row.day,
                    created: 0,
                    completed: Number(row.count),
                })
            }
        });

        console.log(trendMap);

        const trend = Array.from(trendMap.values()).sort((a, b) =>
            a.date.getDate() - b.date.getDate()
        );
        return {
            trend
        }
    },

    async getBranchPerformance():
        Promise<BranchPerformance[]> {
        const [
            branchTotalPF,
            branchCompletedPF,
            branchCancelledPF
        ] = await Promise.all([
            dashboardRepository.getTotalByBranch(prisma),
            dashboardRepository.getBranchCompleted(prisma),
            dashboardRepository.getBranchCancelled(prisma),
        ]);



        const branchIds = branchTotalPF.map(item => item.branchId);
        const branches = await branchRepository.getBranchNames(
            prisma,
            branchIds,
        );

        const branchNameMap = new Map(branches.map(b => [b.id, b.name]));

        const branchTotal = branchTotalPF.map(item => ({
            branchId: item.branchId,
            branchName: branchNameMap.get(item.branchId) || "Unknown",
            totalRequests: item._count.branchId,
            completed: branchCompletedPF.find(pfItem => pfItem.branchId === item.branchId)?._count.branchId,
            cancelled: branchCancelledPF.find(pfItem => pfItem.branchId === item.branchId)?._count.branchId,
        }));

        //console.log(branchTotal, branchCompletedPF, branchCancelledPF);

        return branchTotal;
    },

    async getInbox(
        query: DailyRequestQuery,
        currentUser: CurrentUser,
    ) {
            const result = await dailyRequestRepository.findMany(
                prisma,
                query
            );

            const items = result.items.map((request) =>{
                const {branchId, branch, ...rest} = request;
                return{
                    ...request,
                    capabilities: requestPolicy.buildCapabilities({
                    request,
                    currentUser,
                }),
                salesBranchName: branch ? branch.name : branchId,
                }
            });

            return{
                ...result,
                items,
            };
        }
} 
