import { ApiErrorCode } from "@/types/api";

export class AppError extends Error {

    constructor(

        public readonly code: ApiErrorCode,

        message: string,

        public readonly status = 400,

        public readonly details?: unknown,

    ) {
        super(message);

        this.name = this.constructor.name;
    }
}