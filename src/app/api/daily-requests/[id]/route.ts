import { NextRequest } from "next/server";
import { success, failure } from "@/lib/centralResponse";
import { ApiErrorCode } from "@/types/api";
import { dailyRequestService } from "@/features/dailyRequest/dailyRequestService";
import { AppError } from "@/errors/AppError";
import { authenticate } from "@/features/auth/authMiddleware";
import { BusinessError } from "@/errors/BusinessError";

export async function DELETE(
    req: NextRequest,
    {
        params,
    }: {
        params: Promise<{ id: string }>;
    }
) {
    try {
        const currentUser = await authenticate(req);
        const { id } = await params;
        await dailyRequestService.softDeleteReq(
            id,
            currentUser,
        );

        return success({
            message:
                "Request deleted.",
        });

    } catch (error) {
        console.error(error);

        if (error instanceof AppError) {

            return failure(
                error.code,
                error.message,
                error.status,
                error.details,
            );
        }

        if (error instanceof BusinessError) {

            return failure(
                error.code,
                error.message,
                error.status,
                error.details
            )
        }

        return failure(
            ApiErrorCode.UNKNOWN_ERROR,
            "Failed to retrieve daily request.",
            500
        );
    }
}

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
            await dailyRequestService.getRequestWithCapabilities(
                id,
                currentUser
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
            "Failed to retrieve daily request.",
            500
        );
    }

}

