import { success, failure } from "@/lib/centralResponse";
import { ApiErrorCode } from "@/types/api";
import { AppError } from "@/errors/AppError";
import { authenticate } from "@/features/auth/authMiddleware";
import { NextRequest } from "next/server";
import { dailyRequestLineService } from "@/features/dailyRequestLine/dailyRequestLineService";
import { UpdateLineSchema } from "@/features/dailyRequestLine/dailyRequestLineSchemas";
import { BusinessError } from "@/errors/BusinessError";
import { BusinessErrorCode } from "@/types/business";

export async function GET(
    req: NextRequest,
    {
        params,
    }: {
        params: Promise<{ id: string, lineId: string }>;
    }
) {
    try {
        const currentUser =
            await authenticate(req); //Current User is unsed so far it will be used to check permissions
        const { id, lineId } = await params;


        const result =
            await dailyRequestLineService.getLine(
                lineId
            );

        return success(result);
    }
    catch (error) {
        console.error(error);

        if (error instanceof AppError) {

            return failure(
                error.code,
                error.message,
                error.status,
                error.details,
            );
        }

        return failure(
            ApiErrorCode.UNKNOWN_ERROR,
            "Failed to retrieve request line.",
            500
        );
    }
}

export async function PATCH(
    req: NextRequest,
    {
        params,
    }: {
        params: Promise<{ id: string, lineId: string }>;
    }
) {
    //Must check requestPolicy.canEdit() or so .... 
    try {
        const currentUser = await authenticate(req);
        const { id, lineId } = await params;
        const dto = UpdateLineSchema.parse(
            await req.json()
        );

        switch (dto.operation) {
            case "RECORD_PRODUCTION": {
                    if (dto.producedQty === undefined) {
                        throw new BusinessError(
                            BusinessErrorCode.INSUFFICIENT_PAYLOAD,
                            `Insufficient payload to perform ${dto.operation}. It must contain produced qty.`,
                        )
                    }
                    const result = await dailyRequestLineService.recordProduction(
                        id,
                        lineId,
                        { producedQty: dto.producedQty },
                        currentUser,
                    );

                    return success(result);
            }

            case "RECORD_REQUESTEDQTY": {
                if (dto.requestedQty === undefined) {
                    throw new BusinessError(
                        BusinessErrorCode.INSUFFICIENT_PAYLOAD,
                        `Insufficient payload to perform ${dto.operation}. It must contain requested qty.`,
                    )
                }
                const result = await dailyRequestLineService.recordRequestQty(
                    id,
                    lineId,
                    { requestedQty: dto.requestedQty },
                    currentUser
                );

                return success(result);
            }

            case "RECORD_RECEIVEDQTY": {
                if (dto.receivedQty === undefined) {
                    throw new BusinessError(
                        BusinessErrorCode.INSUFFICIENT_PAYLOAD,
                        `Insufficient payload to perform ${dto.operation}. It must contain received qty.`,
                    )
                }
                const result = await dailyRequestLineService.recordReceiving(
                    id,
                    lineId,
                    { receivedQty: dto.receivedQty },
                    currentUser,
                );

                return success(result);
            }

            case "RECORD_INVENTORY": {
                
                    if (
                        dto.requestedQty === undefined ||
                        dto.previousBalance === undefined ||
                        dto.currentBalance === undefined
                        ) {
                        throw new BusinessError(
                            BusinessErrorCode.INSUFFICIENT_PAYLOAD,
                            `Insufficient payload to perform ${dto.operation}. It must contain requested qty, previous balance and current balance.`,
                        )
                    }
                    const result = await dailyRequestLineService.recordInventory(
                        id,
                        lineId,
                        {
                            requestedQty: dto.requestedQty,
                            previousBalance: dto.previousBalance,
                            currentBalance: dto.currentBalance
                        },
                        currentUser,
                    );
                    return success(result);
            }
        }
    } catch (error) {
        console.error(error);

        if (error instanceof AppError) {

            return failure(
                error.code,
                error.message,
                error.status,
                error.details,
            );
        }

        if (error instanceof BusinessError) {
            return failure(
                error.code,
                error.message,
                error.status,
                error.details
            )
        }

        return failure(
            ApiErrorCode.UNKNOWN_ERROR,
            "Failed to update line.",
            500
        );
    }

}

export async function DELETE(
    req: NextRequest,
    {
        params,
    }: {
        params: Promise<{ id: string, lineId: string }>;
    }
) {
    try {
        const currentUser = await authenticate(req);
        const { id } = await params;
        const { lineId } = await params;

        await dailyRequestLineService.deleteLine(
            id,
            lineId,
            currentUser,
        );

        return success({
            message:
                "Product deleted from request.",
        });

    } catch (error) {
        console.error(error);

        if (error instanceof AppError) {

            return failure(
                error.code,
                error.message,
                error.status,
                error.details,
            );
        }

        return failure(
            ApiErrorCode.UNKNOWN_ERROR,
            "Failed to delete request line.",
            500
        );
    }

}