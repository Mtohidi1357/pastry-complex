import { prisma } from "@/lib/prisma";
import { CurrentUser } from "../auth/authTypes";
import { dailyRequestLineRepository } from "./dailyRequestLineRepository";
import { productRepository } from "@/features/products/productRepository";
import { requestPolicy } from "../dailyRequest/requestPolicy";
import { dailyRequestRepository } from "@/features/dailyRequest/dailyRequestRepository";
import { RequestStatus } from "@/generated/prisma/enums";
import { ApiErrorCode } from "@/types/api";
import { DailyRequest, DailyRequestLine, Product } from "@/generated/prisma/client";
import { AppError } from "@/errors/AppError";
import { BusinessError } from "@/errors/BusinessError";
import { BusinessErrorCode } from "@/types/business";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import {
    CreateLineDTO,
    DailyRequestLineView,
    RecordInventoryDTO,
    RecordProductionDTO,
    RecordReceivingDTO,
    RecordRequestDTO,
} from "./dailyRequestLineTypes";

export const dailyRequestLineService = {
    async createLine(
        requestId: string,
        newLinePayLoad: CreateLineDTO,
        currentUser: CurrentUser
    ) {
        const productExists = await ensureProductExists(
            newLinePayLoad.productId,
        );

        const existing = await ensureProductNotAlreadyInRequest(
            newLinePayLoad.productId,
            requestId,
        );


        const request = await loadEditableRequest(requestId);

        const editPolicy = requestPolicy.canEdit({
            request: request,
            currentUser
        });

        if (!editPolicy.allowed) {
            throw new AppError(
                ApiErrorCode.PERMISSION_DENIED,
                "Permission Denied!"
            );
        }

        return prisma.$transaction(async (tx) => {
            const dailyRequestLine = await dailyRequestLineRepository.addLine(
                tx,
                {
                    previousBalance: newLinePayLoad.prevBalance,
                    currentBalance: newLinePayLoad.currentBalance,
                    dailyRequest: {
                        connect: {
                            id: requestId,
                        }
                    },
                    product: {
                        connect: {
                            id: newLinePayLoad.productId,
                        }
                    }

                }
            )

            return dailyRequestLine;
        })
    },

    async deleteLine(
        requestId: string,
        lineId: string,
        currentUser: CurrentUser,
    ): Promise<boolean> {

        //Checking if this is last line remained ...
        const request = await dailyRequestRepository.findByIdWithLines(prisma, requestId);

        if (!request) {
            throw new BusinessError(
                BusinessErrorCode.REQUEST_NOT_FOUND_ERROR,
                "Request not found."
            )
        };

        const { lines, ...rest } = request;

        if (request?.lines.length === 1
            && request.status !== RequestStatus.DRAFT
        ) {
            throw new BusinessError(
                BusinessErrorCode.LAST_LINE_DELETION_NOT_ALLOWED,
                "Last line for non-Draft requests cannot be deleted."
            )
        };

        //CHeck permission to delete through policy ...
        const policyCheck = requestPolicy.canDelete({
            request: rest,
            currentUser
        });

        if (!policyCheck.allowed) {
            throw new AppError(
                ApiErrorCode.PERMISSION_DENIED,
                "Permission denied."
            )
        }

        //Delete line ...
        const deleteResult: boolean =
            await dailyRequestLineRepository.removeLine(
                prisma,
                requestId,
                lineId
            );
        return deleteResult;
    },

    async getLine(
        lineId: string,
    ) {
        const result = await dailyRequestLineRepository.findById(
            prisma,
            lineId
        );
        return result;
    },

    async recordProduction(
        requestId: string,
        lineId: string,
        prodLinePayload: RecordProductionDTO,
        currentUser: CurrentUser,
    ): Promise<DailyRequestLine | null> {
        const request = await dailyRequestRepository.findById(
            prisma,
            requestId,
        );

        if (!request) {
            throw new BusinessError(
                BusinessErrorCode.REQUEST_NOT_FOUND_ERROR,
                "Request not found."
            );
        };

        const policyCheck = requestPolicy.canProduce({
            request: request,
            currentUser,
        });

        if (!policyCheck.allowed) {
            throw new Error(
                policyCheck.reason
            )
        }
        const dailyRequestLine =
            await dailyRequestLineRepository.updateProdQuantity(
                prisma,
                lineId,
                prodLinePayload,

            );

        return dailyRequestLine;

    },

    async recordRequestQty(
        requestId: string,
        lineId: string,
        requestLinePayLoad: RecordRequestDTO,
        currentUser: CurrentUser,
    ): Promise<DailyRequestLine | null> {
        const request = await dailyRequestRepository.findById(
            prisma,
            requestId,
        );

        if (!request) {
            throw new BusinessError(
                BusinessErrorCode.REQUEST_NOT_FOUND_ERROR,
                "Request not found."
            );
        };

        const policyCheck = requestPolicy.canRequest({
            request: request,
            currentUser,
        });

        if (!policyCheck.allowed) {
            throw new Error(
                policyCheck.reason
            )
        }
        const dailyRequestLine =
            await dailyRequestLineRepository.updateRequestQuantity(
                prisma,
                lineId,
                requestLinePayLoad,
            );

        return dailyRequestLine;

    },

    async recordInventory(
        requestId: string,
        lineId: string,
        inventoryLinePayload: RecordInventoryDTO,
        currentUser: CurrentUser,
    ): Promise<DailyRequestLine | null> {
        const request = await dailyRequestRepository.findByIdWithLines(
            prisma,
            requestId,
        );

        if (!request) {
            throw new BusinessError(
                BusinessErrorCode.REQUEST_NOT_FOUND_ERROR,
                "Request not found."
            );
        };

        if(!request.lines.some(line => line.id === lineId)){
            throw new BusinessError(
                BusinessErrorCode.LINE_REQUEST_MISMATCH,
                "Line does not belong to the request."
            )
        };

        const policyCheck = requestPolicy.canRequest({
            request: request,
            currentUser,
        });

        if (!policyCheck.allowed) {
            throw new PermissionDeniedError(
                policyCheck.reason
            )
        };

        if(inventoryLinePayload.requestedQty === 0) {
            throw new BusinessError(
                BusinessErrorCode.ZERO_QTY_REQUEST_NOT_ALLOWED,
                "You must provide a non-zero value for request."
            )
        };

        if(
            inventoryLinePayload.currentBalance > inventoryLinePayload.previousBalance
        ) {
            throw new BusinessError(
                BusinessErrorCode.FAULTY_BALANCE,
                "Current balance must be less thanor equal to previous balance."
            )
        };

        const dailyRequestLine =
            await dailyRequestLineRepository.updateInventoryQuantity(
                prisma,
                lineId,
                inventoryLinePayload,
            );

        return dailyRequestLine;
    },

    async recordReceiving(
        requestId: string,
        lineId: string,
        receivingLinePayload: RecordReceivingDTO,
        currentUser: CurrentUser,
    ): Promise<DailyRequestLine | null> {
        const request = await dailyRequestRepository.findById(
            prisma,
            requestId,
        );

        if (!request) {
            throw new BusinessError(
                BusinessErrorCode.REQUEST_NOT_FOUND_ERROR,
                "Request not found."
            );
        };

        const policyCheck = requestPolicy.canReceive({
            request: request,
            currentUser,
        });

        if (!policyCheck.allowed) {
            throw new Error(
                policyCheck.reason
            )
        }
        const dailyRequestLine =
            await dailyRequestLineRepository.updateRecivingQuantity(
                prisma,
                lineId,
                {receivedQty: receivingLinePayload.receivedQty},
            );

        return dailyRequestLine;
    },

    async getLineView(
        lineId: string,
    ): Promise<DailyRequestLineView> {
        const requestLine = await dailyRequestLineRepository.findById(
            prisma,
            lineId
        );

        if (!requestLine) {
            throw new BusinessError(
                BusinessErrorCode.REQUEST_LINE_NOT_FOUND_ERROR,
                `Request line not found ${lineId}`,
            )
        }
        const checkedLine = {
            ...requestLine,
            requestedQty: requestLine.requestedQty ?? 0,
            producedQty: requestLine.producedQty ?? 0,
        }
        const variance = checkedLine.requestedQty - checkedLine.producedQty;
        return {
            id: lineId,
            productId: requestLine?.productId!,
            requestedQty: requestLine?.requestedQty!,
            producedQty: requestLine?.producedQty!,
            variance: variance,
        }
    },
}

async function ensureProductExists(
    productId: string
): Promise<Product> {
    const checkExists = await productRepository.findActiveById(
        prisma,
        productId,
    );

    if (!checkExists) {
        throw new BusinessError(
            BusinessErrorCode.PRODUCT_NOT_FOUND,
            "Product is not valid."
        );
    }

    return checkExists;
}

async function ensureProductNotAlreadyInRequest(
    productId: string,
    requestId: string,
): Promise<{ id: string } | null> {
    const existing = await dailyRequestLineRepository.existsProductInRequest(
        prisma,
        productId,
        requestId,
    );

    if (existing) {
        throw new Error(
            "The product is already in the request."
        );
    };

    return existing;
}

async function loadEditableRequest(
    requestId: string
): Promise<DailyRequest> {
    const request = await dailyRequestRepository.findById(
        prisma,
        requestId
    );

    if (!request) {
        throw new BusinessError(
            BusinessErrorCode.REQUEST_NOT_FOUND_ERROR,
            "Request not found."
        );
    };

    return request;

}