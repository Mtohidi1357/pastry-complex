import { NextRequest } from "next/server";
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
    try {
        const currentUser = await authenticate(req);
        
        const searchParams =
            req.nextUrl.searchParams;

        const query = 
            DailyRequestQuerySchema.parse({
                page: searchParams.get("page") ?? undefined,
                pageSize: searchParams.get("pageSize") ?? undefined,
                status: searchParams.get("status") ?? undefined,
                branchId: searchParams.get("branchId") ?? undefined,
                createdById: searchParams.get("createdById") ?? undefined,
                sort: searchParams.get("sort") ?? undefined,
                order: searchParams.get("order") ?? undefined,
                search: searchParams.get("search") ?? undefined,
                completedAt: searchParams.get("completedAt") ?? undefined,
                assinedToId: searchParams.get("assignedToId") ?? undefined,
            });

        const requests =
            await dailyRequestService.list(
                query,
            );

        return success(requests);
    } catch (error) {
        console.error(error);

        return failure(
            ApiErrorCode.DATABASE_ERROR,
            "Failed to load daily requests.",
            500
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        console.log(req);
        const body = await req.json();
        const currentUser = await authenticate(req)
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