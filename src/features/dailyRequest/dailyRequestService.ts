import { withRequestEditLease } from "./withRequestEditLease";
import { prisma, } from "@/lib/prisma";
import { dailyRequestRepository } from "@/features/dailyRequest/dailyRequestRepository";
import { productRepository } from "@/features/products/productRepository";
import { RequestStatus } from "@/generated/prisma/enums";
import { DuplicateBusinessDateRequestError } from "@/errors/DuplicateDailyRequestError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { RequestNotFoundError } from "@/errors/RequestNotFoundError";
import { CurrentUser } from "../auth/authTypes";
import { requestPolicy } from "./requestPolicy";
import { Roles } from "@/lib/constants/roles";
import { DailyRequestQuery } from "@/validation/dailyRequestQuerySchema";
import { requireRequestReadAccess } from "./requestReadAccess";
export interface CreateDailyRequest {
    businessDate: Date;

    branchId: string;

}

export const dailyRequestService = {
    async create(
        request: CreateDailyRequest,
        currentUser: CurrentUser
    ) {
        const existing =
            await dailyRequestRepository.findActiveByBranchAndBusinessDate(
                prisma,
                request.branchId,
                request.businessDate
            );
        if (existing) {
            throw new DuplicateBusinessDateRequestError();
        }

        const products =
            await productRepository.listActive(
                prisma
            );

        if (
            currentUser.roleCode !== Roles.ADMIN &&
            currentUser.branchId !== request.branchId
        ) {
            throw new PermissionDeniedError(
                "Users only can create requests for thier own branch."
            );
        }
        return prisma.$transaction(async (tx) => {
            const dailyRequest =
                await dailyRequestRepository.create(
                    tx,
                    {
                        businessDate: request.businessDate,

                        branch: {
                            connect: {
                                id: request.branchId,
                            },
                        },
                        createdBy: {
                            connect: {
                                id: currentUser.id,
                            },
                        },

                        assignedTo:{
                            connect: {
                                id: currentUser.id,
                            }
                        },

                        status: RequestStatus.DRAFT,
                    }
                );
            const lines =
                products.map(product => ({
                    dailyRequestId: dailyRequest.id,
                    productId: product.id,
                    previousBalance: 10,
                    currentBalance: 10,
                    requestedQty: 15,
                }));

            await dailyRequestRepository.createLines(
                tx,
                lines
            );

            return dailyRequest;
        });
    },
    async softDeleteReq(id: string, currentUser: CurrentUser, editorToken?: string) {
        return withRequestEditLease(id, currentUser, editorToken, async (tx) => {
            const request = await dailyRequestRepository.findById(tx, id);
            if (!request) throw new RequestNotFoundError();
            const permission = requestPolicy.canDelete({ request, currentUser });
            if (!permission.allowed) throw new PermissionDeniedError(permission.reason);
            return dailyRequestRepository.softDelete(tx, id, currentUser.id);
        }, true);
    },
    async getRequestWithCapabilities(
        requestId: string,
        currentUser: CurrentUser
    ) {
        await requireRequestReadAccess(requestId, currentUser);

        const request =
            await dailyRequestRepository.findByIdWithLines(
                prisma,
                requestId
            );

        if (!request) {
            throw new Error("Request not found.");
        }
        const capabilities =
            requestPolicy.buildCapabilities({
                request,
                currentUser,
            });

        return {
            request,
            capabilities,
        };
    },

    async list(
        query: DailyRequestQuery
    ) {
        const request =
            await dailyRequestRepository.findMany(
                prisma,
                query
            )

        const { items, totalItems } = request;
        const totalPages = Math.ceil(totalItems / query.pageSize);

        const page = query.page;

        const pageSize = query.pageSize;

        return {
            items,

            page,

            pageSize,

            totalItems,

            totalPages,
        };
    }
}

