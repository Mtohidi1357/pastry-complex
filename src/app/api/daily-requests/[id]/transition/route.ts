import { TransitionSchema } from "@/validation/workflowSchema";
import { success, failure } from "@/lib/centralResponse";
import { ZodError } from "zod";
import { ApiErrorCode } from "@/types/api";
import { AppError } from "@/errors/AppError";
import { transition } from "@/features/workflow/transitionService";
import { authenticate } from "@/features/auth/authMiddleware";
import { NextRequest } from "next/server";
import { BusinessError } from "@/errors/BusinessError";

export async function POST(
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
        const body = await req.json();
        console.log(body);
        const dto =
            TransitionSchema.parse(body);
        
        await transition({
            requestId: id,
            currentUser,
            action: dto.action,
            note: dto.note,
        });

        return success(
            {
                message:
                    "Workflow transition completed.",
            },
            201
        );
    }
    catch (error) {
        console.error(error);
        if (error instanceof ZodError) {

            return failure(
                ApiErrorCode.VALIDATION_ERROR,
                "Validation Failed.",
                400,
                error.issues
            );
        }

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
            "Failed to transition daily request.",
            500
        );
    }

}