import { DbClient } from "../../repositories/types";

export const branchRepository = {
    async getNameById(
        db: DbClient,
        id: string,
    ): Promise<string | undefined> {
        const branch = await db.branch.findUnique({
            where:{
                id,
            },
        });

        const branchName = branch?.name;
        return branchName;
    },

    async getBranchNames(
        db: DbClient,
        branchIds: string[]
    )
    {
        return await db.branch.findMany({
                where: { id: { in: branchIds } },
                select: { id: true, name: true },
            });
    },

    async getCodeByID(
        db: DbClient,
        id: string,
    ): Promise<string | undefined> {
        const branch = await db.branch.findUnique({
            where:{
                id,
            },
        });

        const branchCode = branch?.code;
        return branchCode;
    },

}
