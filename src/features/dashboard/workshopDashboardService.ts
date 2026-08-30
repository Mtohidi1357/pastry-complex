import { dailyRequestService } from "../dailyRequest/dailyRequestService";

export const workshopDashboardService = {
    async waitingRequests(page: number, pageSize: number) {
        const waitingProductionCount = await dailyRequestService.list(
            {
                order: "desc",
                sort: "businessDate",
                page: page,
                pageSize: pageSize,
                status: "WORKSHOP_PROCESSING",
            },
        );
        return waitingProductionCount;
    },

    async todaysProduction(page?: number, pageSize?: number){
        const todaysProduction = 
            await dailyRequestService.list(
                {
                    order: "desc",
                    sort: "businessDate",
                    page: !page? 1 : page,
                    pageSize: !pageSize ? 5 : pageSize,
                    status: "COMPLETED",
                    completedAt: new Date().getDate().toString(),
                }
            )
    },

}