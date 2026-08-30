import { BusinessErrorCode } from "@/types/business";

export class BusinessError extends Error {

    constructor(

        public readonly code: BusinessErrorCode,

        message: string,

        public readonly status = 400,

        public readonly details?: unknown,

    ) {
        super(message);

        this.name = this.constructor.name;
    }
}