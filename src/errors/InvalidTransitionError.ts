import { AppError } from "./AppError";
import { ApiErrorCode } from "@/types/api";

export class InvalidTransitionError
    extends AppError {

    constructor(from: string, to: string) {

        super(

            ApiErrorCode.INVALID_TRANSITION,

            `Cannot transition from ${from} to ${to}.`,

            400,
        );
    }
}