import { NextRequest } from "next/server";
import { failure, success } from "@/lib/centralResponse";
import { ApiErrorCode } from "@/types/api";
import { authenticate } from "@/features/auth/authMiddleware";
import { dashboardService } from "@/features/dashboard/dashboardService";
import { DailyRequestQuerySchema } from "@/validation/dailyRequestQuerySchema";


export async function GET(req: NextRequest) {
    try {
        const currentUser = await authenticate(req);

        const searchParams =
            req.nextUrl.searchParams;

        const query = DailyRequestQuerySchema.parse({
                page: searchParams.get("page") ?? undefined,
                pageSize: searchParams.get("pageSize") ?? undefined,
                status: searchParams.get("status") ?? undefined,
                branchId: searchParams.get("branchId") ?? undefined,
                createdById: searchParams.get("createdById") ?? undefined,
                sort: searchParams.get("sort") ?? undefined,
                order: searchParams.get("order") ?? undefined,
                search: searchParams.get("search") ?? undefined,
                completedAt: searchParams.get("completedAt") ?? undefined,
                assignedToId: currentUser.id, //must not apear in searchparams!!
            }
        )
        const result = await dashboardService.getInbox(
            query,
            currentUser,
        );
        return success(result);
    } catch (error) {
        console.error(error);

        return failure(
            ApiErrorCode.DATABASE_ERROR,
            "Failed to load dashboard data.",
            500
        );
    }
}