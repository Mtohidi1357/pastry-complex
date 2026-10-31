import { Roles } from "@/lib/constants/roles";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { assertBranchFilterAllowed } from "./requestReadScope";
import { assertCanCreateRequest } from "./requestCreationPolicy";
import { withRequestEditLease } from "./withRequestEditLease";
import { prisma, } from "@/lib/prisma";
import { dailyRequestRepository } from "@/features/dailyRequest/dailyRequestRepository";
import { productRepository } from "@/features/products/productRepository";
import { RequestStatus } from "@/generated/prisma/enums";
import { DuplicateBusinessDateRequestError } from "@/errors/DuplicateDailyRequestError";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { RequestNotFoundError } from "@/errors/RequestNotFoundError";
import type { CurrentUser } from "../auth/authTypes";
import { requestPolicy } from "./requestPolicy";
import type { DailyRequestQuery } from "@/validation/dailyRequestQuerySchema";
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
        assertCanCreateRequest(currentUser, request.branchId);
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
        return prisma.$transaction(async (tx) => {
            // Preserve inventory users' own drafts. Manager-created drafts go to
            // the oldest active inventory account in the same branch.
            const initialAssignee = currentUser.roleCode === Roles.INV
                ? { id: currentUser.id, username: currentUser.username }
                : await tx.user.findFirst({
                    where: {
                        branchId: request.branchId,
                        isActive: true,
                        role: { is: { code: Roles.INV } },
                    },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    select: { id: true, username: true },
                });
            if (!initialAssignee) {
                throw new AppError(
                    ApiErrorCode.VALIDATION_ERROR,
                    "No active inventory user is configured for this branch.",
                    400,
                );
            }
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
                                id: initialAssignee.id,
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
            return { ...dailyRequest, initialAssignee };
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
        query: DailyRequestQuery,
        currentUser: CurrentUser,
    ) {
        const scope = assertBranchFilterAllowed(currentUser, query.branchId);
        const request =
            await dailyRequestRepository.findMany(
                prisma,
                query,
                scope,
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

