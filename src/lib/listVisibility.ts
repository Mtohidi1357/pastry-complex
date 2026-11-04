import { z } from "zod";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
// Do not use z.coerce.boolean(): the string "false" is truthy in JavaScript.
export const showFinishedQuery = z.enum(["true", "false"]).transform(value => value === "true").optional();
export function parseShowFinished(value: string | null | undefined): boolean {
    if (value == null || value === "false") return false;
    if (value === "true") return true;
    throw new AppError(ApiErrorCode.VALIDATION_ERROR, "showFinished must be true or false.", 400);
}
