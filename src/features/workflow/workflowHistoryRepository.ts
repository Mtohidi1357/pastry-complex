import { DbClient } from "../../repositories/types";

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
        db:DbClient
    ){
        return await db.workflowHistory.findMany({
            where:{
                changedAt: {
                    gte: new Date(Date.now() - 5 * 60 * 60 * 24 * 1000),
                }
            },

            include: {
                user: true,
            },

            orderBy: {
                changedAt: 'desc',
            },

            take: 20
        })
    },

};