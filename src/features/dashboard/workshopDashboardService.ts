import type { CurrentUser } from "../auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { dailyRequestService } from "../dailyRequest/dailyRequestService";

function requireWorkshopRole(user: CurrentUser) {
    if (user.roleCode !== Roles.WM && user.roleCode !== Roles.ADMIN) {
        throw new PermissionDeniedError("Only workshop managers and administrators can open the workshop dashboard.");
    }
}
function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const workshopDashboardService = {
    async waitingRequests(page: number, pageSize: number, user: CurrentUser, branchId?: string) {
        requireWorkshopRole(user);
        return dailyRequestService.list({
            order: "desc", sort: "businessDate", page, pageSize, status: "MANAGER_SUBMITTED", branchId,
        }, user);
    },
    async todaysProduction(user: CurrentUser, page = 1, pageSize = 5, branchId?: string) {
        requireWorkshopRole(user);
        return dailyRequestService.list({
            order: "desc", sort: "businessDate", page, pageSize,
            status: "COMPLETED", completedAt: today(), branchId,
        }, user);
    },
    async getOverview(user: CurrentUser, page: number, pageSize: number, branchId?: string) {
        requireWorkshopRole(user);
        const [waitingRequests, processingRequests, todaysProduction] = await Promise.all([
            this.waitingRequests(page, pageSize, user, branchId),
            dailyRequestService.list({ order: "desc", sort: "businessDate", page, pageSize, status: "WORKSHOP_PROCESSING", branchId }, user),
            this.todaysProduction(user, page, pageSize, branchId),
        ]);
        return { waitingRequests, processingRequests, todaysProduction };
    },
};
