import { ApiErrorCode } from "@/types/api";

import { AppError } from "./AppError";

export class RequestNotFoundError
    extends AppError {

    constructor() {

        super(

            ApiErrorCode.REQUEST_NOT_FOUND_ERROR,

            "Daily request NOT found.",

            404,
        );
    }
}