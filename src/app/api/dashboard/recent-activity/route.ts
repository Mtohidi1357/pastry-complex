import { NextRequest } from "next/server";
import { failure, success } from "@/lib/centralResponse";
import { ApiErrorCode } from "@/types/api";
import { authenticate } from "@/features/auth/authMiddleware";
import { getRecentActivity } from "@/features/workflow/workflowService";

export async function GET(req: NextRequest) {
    try {
        const currentUser = authenticate(req);

        const result = await getRecentActivity();
        
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