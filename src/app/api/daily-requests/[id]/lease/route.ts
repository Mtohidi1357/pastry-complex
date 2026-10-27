import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { authenticate } from "@/features/auth/authMiddleware";
import { performLeaseAction } from "@/features/dailyRequest/editLeaseService";
import { success, failure } from "@/lib/centralResponse";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";

const leaseSchema = z.object({
    action: z.enum(["acquire", "renew", "release"]),
    editorToken: z.string().uuid(),
});

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const currentUser = await authenticate(req);
        const { id } = await params;

        let body: unknown;

        try {
            body = await req.json();
        } catch {
            return failure(
                ApiErrorCode.VALIDATION_ERROR,
                "Invalid JSON body.",
                400,
            );
        }

        const dto = leaseSchema.parse(body);

        const result = await performLeaseAction(
            id,
            currentUser,
            dto.editorToken,
            dto.action,
        );

        return success(result);
    } catch (error) {
        if (error instanceof ZodError) {
            return failure(
                ApiErrorCode.VALIDATION_ERROR,
                "Invalid lease request.",
                400,
                error.issues,
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

        console.error(error);

        return failure(
            ApiErrorCode.UNKNOWN_ERROR,
            "Failed to update editing lease.",
            500,
        );
    }
}