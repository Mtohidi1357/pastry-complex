import type { NextRequest } from "next/server";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { dashboardService } from "@/features/dashboard/dashboardService";

export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => dashboardService.getBranchPerformance(user));
}
