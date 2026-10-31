import type { RequestReadScope } from "../dailyRequest/requestReadScope";
import type { DbClient } from "../../repositories/types";

export const workflowHistoryRepository = {

    async findByRequestId(
        db: DbClient,
        requestId: string,
    ) {
        return db.workflowHistory.findMany({
            where: {
                dailyRequestId: requestId,
            },

            orderBy: {
                changedAt: "asc",
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
            },
        });
    },

    async getRecent(
        db: DbClient,
        scope: RequestReadScope,
    ){
        return await db.workflowHistory.findMany({
            where:{
                dailyRequest: { is: scope },
                changedAt: {
                    gte: new Date(Date.now() - 5 * 60 * 60 * 24 * 1000),
                }
            },
            include: {
                user: { select: { id: true, username: true } },
            },

            orderBy: {
                changedAt: 'desc',
            },

            take: 20
        })
    },

};

