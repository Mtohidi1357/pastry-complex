import { ApiErrorCode } from "@/types/api";
import { BusinessErrorCode } from "@/types/business";
import { NextResponse } from "next/server";

export function success<T>(data: T, status = 200) {
    return NextResponse.json(
        {
            success: true,
            data,
        },
        {
            status,
        }
    );
}

export function failure(
    code: ApiErrorCode | BusinessErrorCode,
    message: string,
    status = 400,
    details?: unknown
) {
    return NextResponse.json(
        {
            success: false,
            error: {
                code,
                message,
                details,
            },
        },
        { status }
    );
}