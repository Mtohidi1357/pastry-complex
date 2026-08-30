import { success, failure } from "@/lib/centralResponse";
import { ZodError } from "zod";
import { ApiErrorCode } from "@/types/api";
import { AppError } from "@/errors/AppError";
import { authenticate } from "@/features/auth/authMiddleware";
import { NextRequest } from "next/server";
import { CreateLineSchema } from "@/features/dailyRequestLine/dailyRequestLineSchemas";
import { dailyRequestLineService } from "@/features/dailyRequestLine/dailyRequestLineService";
import { BusinessError } from "@/errors/BusinessError";
import { fail } from "assert";

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

        const dto =
            CreateLineSchema.parse(body);

        await dailyRequestLineService.createLine(
            id,
            dto,
            currentUser
        );

        return success(
            {
                message:
                    "Line created successfully.",
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

        if(error instanceof BusinessError) {
            
            return failure(
                error.code,
                error.message,
                error.status,
                error.details
            )
        }

        return failure(
            ApiErrorCode.UNKNOWN_ERROR,
            "Failed to create daily request.",
            500
        );
    }

}
