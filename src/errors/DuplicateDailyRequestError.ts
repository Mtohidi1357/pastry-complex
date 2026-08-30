import { ApiErrorCode } from "@/types/api";

import { AppError } from "./AppError";

export class DuplicateBusinessDateRequestError
    extends AppError {

    constructor() {

        super(

            ApiErrorCode.VALIDATION_ERROR,

            "Daily request already exists.",

            409,
        );
    }
}