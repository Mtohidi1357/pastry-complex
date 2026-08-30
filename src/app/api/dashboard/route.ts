import { NextRequest } from "next/server";
import { failure, success } from "@/lib/centralResponse";
import { ApiErrorCode } from "@/types/api";
import { authenticate } from "@/features/auth/authMiddleware";
import { dashboardService } from "@/features/dashboard/dashboardService";

export async function GET(req: NextRequest) {
    try {
        
        const currentUser = authenticate(req); // To be used laater ....

        const result = await dashboardService.getSummary();
        //console.log("Numer of completed reqs: ")
        //console.log(result.completedRequests.length);
        return success(JSON.stringify(result));
    } catch (error) {
        console.error(error);

        return failure(
            ApiErrorCode.DATABASE_ERROR,
            "Failed to load dashboard data.",
            500
        );
    }
}