import type { DbClient } from "@/repositories/types";
import { Prisma } from "@/generated/prisma/client";
import { RequestStatus } from "@/generated/prisma/enums";
import type { RequestReadScope } from "../dailyRequest/requestReadScope";

// Fixed SQL identifiers and bound values only; never interpolate URL text.
function visibilitySql(scope: RequestReadScope) {
    return Prisma.sql`r.deletedAt IS NULL
        ${scope.branchId ? Prisma.sql`AND r.branchId = ${scope.branchId}` : Prisma.empty}
        ${scope.assignedToId ? Prisma.sql`AND r.assignedToId = ${scope.assignedToId}` : Prisma.empty}`;
}
function dayBounds(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { gte: start, lt: end };
}

export const dashboardRepository = {
    async countByStatus(db: DbClient, status: RequestStatus, scope: RequestReadScope) {
        return db.dailyRequest.count({ where: { AND: [scope, { status }] } });
    },
    async countCountOnDate(db: DbClient, date: Date, scope: RequestReadScope) {
        return db.dailyRequest.count({ where: { AND: [scope, { createdAt: dayBounds(date) }] } });
    },
    async countCompletedTody(db: DbClient, date: Date, scope: RequestReadScope) {
        return db.dailyRequest.count({ where: { AND: [scope, { completedAt: dayBounds(date) }] } });
    },
    async getCompletedRequests(db: DbClient, scope: RequestReadScope) {
        return db.dailyRequest.findMany({
            where: { AND: [scope, { completedAt: { not: null }, submittedAt: { not: null } }] },
            select: { submittedAt: true, completedAt: true },
        });
    },
    async getStatusDistributionChart(db: DbClient, scope: RequestReadScope) {
        return db.dailyRequest.groupBy({ by: ["status"], where: scope, _count: { status: true } });
    },
    async getCreatedByDate(db: DbClient, scope: RequestReadScope) {
        const rows = await db.$queryRaw<{ day: string; count: bigint }[]>`
            SELECT DATE_FORMAT(r.createdAt, '%Y-%m-%d') AS day, COUNT(*) AS count
            FROM daily_requests r
            WHERE ${visibilitySql(scope)}
            GROUP BY DATE_FORMAT(r.createdAt, '%Y-%m-%d')
        `;
        return rows.map(row => ({ day: row.day, count: Number(row.count) }));
    },
    async getCompletedByDate(db: DbClient, scope: RequestReadScope) {
        const rows = await db.$queryRaw<{ day: string; count: bigint }[]>`
            SELECT DATE_FORMAT(r.completedAt, '%Y-%m-%d') AS day, COUNT(*) AS count
            FROM daily_requests r
            WHERE ${visibilitySql(scope)} AND r.completedAt IS NOT NULL
            GROUP BY DATE_FORMAT(r.completedAt, '%Y-%m-%d')
        `;
        return rows.map(row => ({ day: row.day, count: Number(row.count) }));
    },
    async getTotalByBranch(db: DbClient, scope: RequestReadScope) {
        return db.dailyRequest.groupBy({ by: ["branchId"], where: scope, _count: { branchId: true } });
    },
    async getBranchCompleted(db: DbClient, scope: RequestReadScope) {
        return db.dailyRequest.groupBy({
            by: ["branchId"], where: { AND: [scope, { status: RequestStatus.CLOSED }] }, _count: { branchId: true },
        });
    },
    async getBranchCancelled(db: DbClient, scope: RequestReadScope) {
        return db.dailyRequest.groupBy({
            by: ["branchId"], where: { AND: [scope, { status: RequestStatus.CANCELLED }] }, _count: { branchId: true },
        });
    },
};
