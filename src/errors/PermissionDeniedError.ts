import { AppError } from "./AppError";
import { ApiErrorCode } from "@/types/api";

export class PermissionDeniedError
    extends AppError {

    constructor(reason?: string) {

        super(

            ApiErrorCode.PERMISSION_DENIED,

            reason ?? "Permission denied.",

            403,
        );
    }
}