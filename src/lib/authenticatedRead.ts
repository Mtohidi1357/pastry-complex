import type { NextRequest } from "next/server";
import type { CurrentUser } from "@/features/auth/authTypes";
import { authenticate } from "@/features/auth/authMiddleware";
import { success, failure } from "./centralResponse";
import { AppError } from "@/errors/AppError";
import { BusinessError } from "@/errors/BusinessError";
import { ApiErrorCode } from "@/types/api";
import { ZodError } from "zod";

export async function authenticatedRead<T>(
    req: NextRequest,
    read: (user: CurrentUser) => Promise<T>,
) {
    try {
        const user = await authenticate(req);
        const response = success(await read(user));
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        if (error instanceof ZodError) {
            return failure(ApiErrorCode.VALIDATION_ERROR, "Invalid query parameters.", 400, error.issues);
        }
        if (error instanceof AppError || error instanceof BusinessError) {
            return failure(error.code, error.message, error.status, error.details);
        }
        console.error(error);
        return failure(ApiErrorCode.UNKNOWN_ERROR, "Failed to load data.", 500);
    }
}
