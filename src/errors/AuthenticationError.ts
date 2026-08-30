import { ApiErrorCode } from "@/types/api";
import { AppError } from "./AppError";

export class AuthenticationError
    extends AppError {

    constructor(
        message = "Authentication failed."
    ) {

        super(
            ApiErrorCode.AUTHENTICATION_ERROR,
            message,
            401
        );

    }

}