import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "../auth/authTypes";
import type { DailyRequestLine, Prisma } from "@/generated/prisma/client";
import { RequestStatus } from "@/generated/prisma/enums";
import { AppError } from "@/errors/AppError";
import { BusinessError } from "@/errors/BusinessError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { ApiErrorCode } from "@/types/api";
import { BusinessErrorCode } from "@/types/business";
import { dailyRequestLineRepository } from "./dailyRequestLineRepository";
import { dailyRequestRepository } from "../dailyRequest/dailyRequestRepository";
import { productRepository } from "../products/productRepository";
import { requestPolicy } from "../dailyRequest/requestPolicy";
import { requireRequestReadAccess } from "../dailyRequest/requestReadAccess";
import { withRequestEditLease } from "../dailyRequest/withRequestEditLease";
import type {
    CreateLineDTO, DailyRequestLineView, RecordInventoryDTO,
    RecordProductionDTO, RecordReceivingDTO, RecordRequestDTO,
} from "./dailyRequestLineTypes";

type QuantityPolicy = "canProduce" | "canRequest" | "canReceive";

async function editLine(
    requestId: string,
    lineId: string,
    currentUser: CurrentUser,
    editorToken: string | undefined,
    policy: QuantityPolicy,
    operation: (tx: Prisma.TransactionClient) => Promise<DailyRequestLine | null>,
) {
    return withRequestEditLease(requestId, currentUser, editorToken, async (tx) => {
        const request = await dailyRequestRepository.findById(tx, requestId);
        if (!request) {
            throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
        }
        const permission = requestPolicy[policy]({ request, currentUser });
        if (!permission.allowed) throw new PermissionDeniedError(permission.reason);
        const line = await tx.dailyRequestLine.findFirst({
            where: { id: lineId, dailyRequestId: requestId },
        });
        if (!line) {
            throw new BusinessError(
                BusinessErrorCode.LINE_REQUEST_MISMATCH,
                "Line does not belong to the request.",
            );
        }
        return operation(tx);
    });
}

export const dailyRequestLineService = {
    async createLine(
        requestId: string,
        payload: CreateLineDTO,
        currentUser: CurrentUser,
        editorToken?: string,
    ) {
        return withRequestEditLease(requestId, currentUser, editorToken, async (tx) => {
            const request = await dailyRequestRepository.findById(tx, requestId);
            if (!request) throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
            const permission = requestPolicy.canEdit({ request, currentUser });
            if (!permission.allowed) throw new PermissionDeniedError(permission.reason);
            const product = await productRepository.findActiveById(tx, payload.productId);
            if (!product) {
                throw new BusinessError(BusinessErrorCode.PRODUCT_NOT_FOUND, "Product is not valid.");
            }
            const existing = await dailyRequestLineRepository.existsProductInRequest(
                tx, payload.productId, requestId,
            );
            if (existing) {
                throw new AppError(ApiErrorCode.VALIDATION_ERROR, "The product is already in the request.", 409);
            }
            return dailyRequestLineRepository.addLine(tx, {
                previousBalance: payload.prevBalance,
                currentBalance: payload.currentBalance,
                dailyRequest: { connect: { id: requestId } },
                product: { connect: { id: payload.productId } },
            });
        });
    },

    async deleteLine(
        requestId: string,
        lineId: string,
        currentUser: CurrentUser,
        editorToken?: string,
    ): Promise<boolean> {
        return withRequestEditLease(requestId, currentUser, editorToken, async (tx) => {
            const request = await dailyRequestRepository.findByIdWithLines(tx, requestId);
            if (!request) throw new AppError(ApiErrorCode.NOT_FOUND, "Request not found.", 404);
            const permission = requestPolicy.canDelete({ request, currentUser });
            if (!permission.allowed) throw new PermissionDeniedError(permission.reason);
            if (!request.lines.some(line => line.id === lineId)) {
                throw new BusinessError(BusinessErrorCode.LINE_REQUEST_MISMATCH, "Line does not belong to the request.");
            }
            if (request.lines.length === 1 && request.status !== RequestStatus.DRAFT) {
                throw new BusinessError(
                    BusinessErrorCode.LAST_LINE_DELETION_NOT_ALLOWED,
                    "Last line for non-Draft requests cannot be deleted.",
                );
            }
            return dailyRequestLineRepository.removeLine(tx, requestId, lineId);
        });
    },

    async getLine(requestId: string, lineId: string, currentUser: CurrentUser) {
        await requireRequestReadAccess(requestId, currentUser);
        const line = await prisma.dailyRequestLine.findFirst({
            where: { id: lineId, dailyRequestId: requestId },
        });
        if (!line) throw new AppError(ApiErrorCode.NOT_FOUND, "Request line not found.", 404);
        return line;
    },

    async recordProduction(
        requestId: string, lineId: string, payload: RecordProductionDTO,
        currentUser: CurrentUser, editorToken?: string,
    ) {
        return editLine(requestId, lineId, currentUser, editorToken, "canProduce", tx =>
            dailyRequestLineRepository.updateProdQuantity(tx, requestId, lineId, payload));
    },

    async recordRequestQty(
        requestId: string, lineId: string, payload: RecordRequestDTO,
        currentUser: CurrentUser, editorToken?: string,
    ) {
        return editLine(requestId, lineId, currentUser, editorToken, "canRequest", tx =>
            dailyRequestLineRepository.updateRequestQuantity(tx, requestId, lineId, payload));
    },

    async recordInventory(
        requestId: string, lineId: string, payload: RecordInventoryDTO,
        currentUser: CurrentUser, editorToken?: string,
    ) {
        return editLine(requestId, lineId, currentUser, editorToken, "canRequest", async tx => {
            if (payload.requestedQty === 0) {
                throw new BusinessError(BusinessErrorCode.ZERO_QTY_REQUEST_NOT_ALLOWED, "You must provide a non-zero value for request.");
            }
            if (payload.currentBalance > payload.previousBalance) {
                throw new BusinessError(BusinessErrorCode.FAULTY_BALANCE, "Current balance must be less than or equal to previous balance.");
            }
            return dailyRequestLineRepository.updateInventoryQuantity(tx, requestId, lineId, payload);
        });
    },

    async recordReceiving(
        requestId: string, lineId: string, payload: RecordReceivingDTO,
        currentUser: CurrentUser, editorToken?: string,
    ) {
        return editLine(requestId, lineId, currentUser, editorToken, "canReceive", tx =>
            dailyRequestLineRepository.updateRecivingQuantity(tx, requestId, lineId, payload));
    },

    async getLineView(lineId: string): Promise<DailyRequestLineView> {
        const line = await dailyRequestLineRepository.findById(prisma, lineId);
        if (!line) {
            throw new BusinessError(BusinessErrorCode.REQUEST_LINE_NOT_FOUND_ERROR, `Request line not found ${lineId}`);
        }
        return {
            id: lineId,
            productId: line.productId,
            requestedQty: line.requestedQty ?? 0,
            producedQty: line.producedQty ?? 0,
            variance: (line.requestedQty ?? 0) - (line.producedQty ?? 0),
        };
    },
};
