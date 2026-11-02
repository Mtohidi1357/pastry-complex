import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { authenticate } from "@/features/auth/authMiddleware";
import { restoreRequest } from "@/features/dailyRequest/requestRestoreService";
import { success, failure } from "@/lib/centralResponse";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await authenticate(req);
        const { id } = await params;
        z.uuid().parse(id);
        const response = success(await restoreRequest(id, user));
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        if (error instanceof ZodError) return failure(ApiErrorCode.VALIDATION_ERROR, "Invalid request ID.", 400, error.issues);
        if (error instanceof AppError) return failure(error.code, error.message, error.status, error.details);
        console.error(error);
        return failure(ApiErrorCode.UNKNOWN_ERROR, "Failed to restore request.", 500);
    }
}
