import type { NextRequest } from "next/server";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { dashboardService } from "@/features/dashboard/dashboardService";
import { DailyRequestQuerySchema } from "@/validation/dailyRequestQuerySchema";

export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => {
        const query = DailyRequestQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        return dashboardService.getInbox(query, user);
    });
}
