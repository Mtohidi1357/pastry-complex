import { authenticatedRead } from "@/lib/authenticatedRead";
import type { NextRequest } from "next/server";
import { success, failure } from "@/lib/centralResponse";
import { ApiErrorCode } from "@/types/api";
import { dailyRequestService } from "@/features/dailyRequest/dailyRequestService";
import { CreateDailyRequestSchema } from "@/validation/dailyRequestSchema";
import { ZodError } from "zod";
import { AppError } from "@/errors/AppError";
import { authenticate } from "@/features/auth/authMiddleware";
import { DailyRequestQuerySchema } from "@/validation/dailyRequestQuerySchema";
import { BusinessError } from "@/errors/BusinessError";
export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => {
        const query = DailyRequestQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        return dailyRequestService.list(query, user);
    });
}
export async function POST(req: NextRequest) {
    try {
        //console.log(req);
        const currentUser = await authenticate(req);
        const body = await req.json();
        const dto =
            CreateDailyRequestSchema.parse(body);

        const result =
            await dailyRequestService.create(
                {
                    ...dto,

                    businessDate:
                        new Date(dto.businessDate),

                },
                currentUser);
        return success(result, 201);

    } catch (error) {

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

