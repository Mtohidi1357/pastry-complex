import { dashboardService } from "@/features/dashboard/dashboardService";
import { success, failure } from "@/lib/centralResponse";
import { ApiErrorCode } from "@/types/api";
import { DailyRequestQuerySchema } from "@/validation/dailyRequestQuerySchema";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const searchParams =
            req.nextUrl.searchParams;
        
        const query = 
            DailyRequestQuerySchema.parse({
                days: searchParams.get("days") ?? undefined,
            });
        
        const results = dashboardService.getRequestTrend();
        
        return success(results);
    } catch (error) {
        console.error(error);

        return failure(
            ApiErrorCode.DATABASE_ERROR,
            "Failed to load daily requests.",
            500
        );
    }
}