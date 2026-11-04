import { parseTrackingCode } from "@/lib/trackingCode";
import type { RequestReadScope } from "./requestReadScope";
import type { DbClient } from "../../repositories/types";
import {
    Prisma,
    RequestStatus,
} from "@/generated/prisma/client";
import type { DailyRequestQuery } from "@/validation/dailyRequestQuerySchema";
import { getSkip } from "@/lib/query/pagination";
import { buildOrder } from "@/lib/query/buildOrder";

export const dailyRequestRepository = {
    async findByIdWithLines(
        db: DbClient,
        id: string,
    ) {
        return db.dailyRequest.findUnique({
            where: {
                id,
                deletedAt: null,
            },
            include: {
                lines: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                                displayName: true,
                                unit: true,
                            }
                        },
                    }
                },
            }
        });
    },

    async findById(
        db: DbClient,
        id: string,
    ) {
        return db.dailyRequest.findUnique({
            where: {
                id,
                deletedAt: null,
            },
        });
    },

    async findMany(db: DbClient, query: DailyRequestQuery, scope: RequestReadScope) {
        const skip = getSkip(query.page, query.pageSize);
        const orderBy = buildOrder(query.sort, query.order, "businessDate");
        const reference = query.search ? parseTrackingCode("REQ", query.search) : null;
        const filters: Prisma.DailyRequestWhereInput = {
            ...(query.status && { status: query.status }),
            ...(query.branchId && { branchId: query.branchId }),
            ...(query.createdById && { createdById: query.createdById }),
            ...(query.assignedToId && { assignedToId: query.assignedToId }),
            ...(query.completedAt && {
                completedAt: {
                    gte: new Date(`${query.completedAt}T00:00:00`),
                    lt: new Date(new Date(`${query.completedAt}T00:00:00`).getTime() + 86400000),
                },
            }),
            ...(query.search && {
                OR: [
                    ...(reference !== null ? [{ trackingNumber: reference }] : []),
                    { createdBy: { username: { contains: query.search } } },
                    { assignedTo: { username: { contains: query.search } } },
                ],
            }),
        };
        const visibility: Prisma.DailyRequestWhereInput = query.showFinished === true ? {} : { status: { notIn: [RequestStatus.CLOSED, RequestStatus.CANCELLED] } };
        const where: Prisma.DailyRequestWhereInput = { AND: [scope, filters, visibility] };
        const [items, totalItems] = await Promise.all([
            db.dailyRequest.findMany({ where, include: { branch: true }, orderBy, skip, take: query.pageSize }),
            db.dailyRequest.count({ where }),
        ]);
        return { items, totalItems };
    },

    async create(
        db: DbClient,
        data: Prisma.DailyRequestCreateInput
    ) {
        return db.dailyRequest.create({
            data,
        });
    },
    async update(
        db: DbClient,
        id: string,
        data: Prisma.DailyRequestUpdateInput
    ) {
        return db.dailyRequest.update({
            where: {
                id,
                deletedAt: null,
            },
            data,
        });
    },
    async findByBusinessDate(
        db: DbClient,
        branchId: string,
        businessDate: Date
    ) {
        return db.dailyRequest.findFirst({
            where: {
                deletedAt: null,
                branchId,
                businessDate,

            },
        });
    },
    async listByStatus(
        db: DbClient,
        status: RequestStatus
    ) {
        return db.dailyRequest.findMany({
            where: {
                status,
                deletedAt: null,
            },
            include: {
                branch: true,
                createdBy: true,
            },

            orderBy: {
                businessDate: "desc",
            },
        });
    },
    async listByBranch(
        db: DbClient,
        branchId: string
    ) {
        return db.dailyRequest.findMany({
            where: {
                branchId,
                deletedAt: null,
            },
            orderBy: {
                businessDate: "desc",
            },
        });
    },
    async listBetweenDates(
        db: DbClient,
        start: Date,
        end: Date
    ) {
        return db.dailyRequest.findMany({
            where: {
                deletedAt: null,
                businessDate: {
                    gte: start,
                    lte: end,
                },
            },
            orderBy: {
                businessDate: "desc",
            },
        });
    },
    async listPending(
        db: DbClient
    ) {
        return db.dailyRequest.findMany({
            where: {
                deletedAt: null,
                status: {
                    in: [
                        RequestStatus.DRAFT,
                        RequestStatus.INVENTORY_SUBMITTED,
                        RequestStatus.MANAGER_SUBMITTED,
                        RequestStatus.WORKSHOP_PROCESSING,
                    ],
                },
            },
            orderBy: {
                businessDate: "desc",
            },
        });
    },
    async createHistory(
        db: DbClient,
        data: Prisma.WorkflowHistoryUncheckedCreateInput
    ) {
        return db.workflowHistory.create({
            data,
        });
    },

    async softDelete(
        db: DbClient,
        id: string,
        deletedById: string
    ) {
        return db.dailyRequest.update({
            where: {
                id,
            },
            data: {
                deletedAt: new Date(),
                deletedById,
            }
        });
    },
    async restore(
        db: DbClient,
        id: string
    ) {
        return db.dailyRequest.update({
            where: {
                id,
            },
            data: {
                deletedAt: null,
                deletedById: null,
            }
        });
    },

    async createLines(
        db: DbClient,
        lines: Prisma.DailyRequestLineCreateManyInput[],
    ) {
        return db.dailyRequestLine.createMany({
            data: lines,
        });
    },
    async findActiveByBranchAndBusinessDate(
        db: DbClient,
        branchId: string,
        businessDate: Date,
    ) {
        const start = new Date(businessDate);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 1);
        return db.dailyRequest.findFirst({
            where: {
                deletedAt: null,
                branchId,
                businessDate: { gte: start, lt: end },
            },
        });
    },
}

