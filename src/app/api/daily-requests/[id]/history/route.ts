import { authenticate } from "@/features/auth/authMiddleware";
import { NextRequest } from "next/server";
import { success, failure } from "@/lib/centralResponse";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { getHistory } from "@/features/workflow/workflowService";

export async function GET(
    req: NextRequest,
    {
        params,
    }: {
        params: Promise<{ id: string }>;
    }) {

    try {
        const currentUser =
            await authenticate(req);
        const { id } = await params;


        const result =
            await getHistory(
                id,
            );

        return success(result);
    }
    catch (error) {
        console.error(error);

        if (error instanceof AppError) {

            return failure(
                error.code,
                error.message,
                error.status,
                error.details,
            );
        }

        return failure(
            ApiErrorCode.UNKNOWN_ERROR,
            "Failed to retrieve daily request history.",
            500
        );
    }

}
