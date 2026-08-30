import { DbClient } from "@/repositories/types";
import { RequestStatus } from "@/generated/prisma/enums";

export const dashboardRepository = {
    async countByStatus(
        db: DbClient,
        status: RequestStatus,
    ) {
        return db.dailyRequest.count({
            where: {
                deletedAt: null,
                status,
            },
        });
    },

    async countCountOnDate(
        db: DbClient,
        date: Date,
    ) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        return db.dailyRequest.count({
            where: {
                deletedAt: null,
                createdAt: {
                    gte: start,
                    lt: end,
                }
            }
        })
    },

    async countCompletedTody(
        db: DbClient,
        date: Date,
    ) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        return db.dailyRequest.count({
            where: {
                deletedAt: null,
                completedAt: {
                    gte: start,
                    lt: end,
                }
            }
        })
    },

    async getCompletedRequests(
        db: DbClient,
    ) {
        return db.dailyRequest.findMany({
            where: {
                deletedAt: null,
                completedAt: {
                    not: null,
                },
                submittedAt: {
                    not: null,
                },
            },

            select: {
                submittedAt: true,
                completedAt: true,
            },
        });
    },

    async getStatusDistributionChart(
        db: DbClient,
    ) {
        return await db.dailyRequest.groupBy({
            by: ["status"],
            where: {
                deletedAt: null,
            },
            _count: {
                status: true,
            },
        });
    },

    async getCreatedByDate(
        db: DbClient,
    ) {
        const result = await db.$queryRaw<{
            day: Date;
            count: bigint;
        }[]>`
    SELECT
        DATE(createdAt) AS day,
        COUNT(*) AS count
    FROM daily_requests
    GROUP BY DATE(createdAt)
`;

        return result.map(row => ({
            day: row.day,
            count: Number(row.count),
        }));
    },

    async getCompletedByDate(
        db: DbClient,
    ) {
        const result = await db.$queryRaw<{
            day: Date;
            count: bigint;
        }[]>`
    SELECT
        DATE(completedAt) AS day,
        COUNT(*) AS count
    FROM daily_requests
    WHERE completedAt IS NOT NULL
    GROUP BY DATE(completedAt)
`;

        return result.map(row => ({
            day: row.day,
            count: Number(row.count),
        }));
    },

    async getTotalByBranch(
        db: DbClient,
    ) {
        const rawRecords = await db.dailyRequest.groupBy({
                    by: ["branchId"],
                    where: {
                        deletedAt: null,
                    },
                    _count: {
                        branchId: true
                    }
                });

        return rawRecords;
    },

    async getBranchCompleted(
        db: DbClient
    ) {
        return await db.dailyRequest.groupBy({
            by: ["branchId"],
            where: {
                deletedAt: null,
                status: RequestStatus.CLOSED
            },
            _count: {
                branchId: true,
            }
        });
    },

    async getBranchCancelled(
        db: DbClient
    ) {
        return await db.dailyRequest.groupBy({
            by: ["branchId"],
            where: {
                deletedAt: null,
                status: RequestStatus.CANCELLED
            },
            _count: {
                branchId: true,
            }
        });
    },
}
