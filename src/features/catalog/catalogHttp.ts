import type { NextRequest } from "next/server";
import type { CurrentUser } from "../auth/authTypes";
import { authenticate } from "../auth/authMiddleware";
import { AppError } from "@/errors/AppError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { ApiErrorCode } from "@/types/api";
import { success, failure } from "@/lib/centralResponse";
import { ZodError } from "zod";
export function catalogAdmin(user: CurrentUser) { if (user.roleCode !== "ADMIN") throw new PermissionDeniedError("Only administrators can manage the product catalog."); }
export async function catalogHttp(req: NextRequest, operation: (user: CurrentUser) => Promise<unknown>, status = 200) {
    try { const user = await authenticate(req); catalogAdmin(user); const response = success(await operation(user), status); response.headers.set("Cache-Control", "private, no-store"); return response; }
    catch (error) {
        if (error instanceof AppError) return failure(error.code, error.message, error.status, error.details);
        if (error instanceof ZodError || error instanceof SyntaxError) return failure(ApiErrorCode.VALIDATION_ERROR, "Check the product fields and try again.", 400, error instanceof ZodError ? error.issues : undefined);
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return failure(ApiErrorCode.VALIDATION_ERROR, "This product/category code or barcode already exists. Reload the catalog before retrying.", 409);
        console.error(error); return failure(ApiErrorCode.UNKNOWN_ERROR, "Catalog operation failed. No partial change was committed.", 500);
    }
}
