import type { NextRequest } from "next/server";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { workshopDashboardService } from "@/features/dashboard/workshopDashboardService";
import { DailyRequestQuerySchema } from "@/validation/dailyRequestQuerySchema";

export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => {
        const query = DailyRequestQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        return workshopDashboardService.getOverview(user, query.page, query.pageSize, query.branchId);
    });
}
