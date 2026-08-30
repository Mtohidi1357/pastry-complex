import type { DbClient } from "@/repositories/types";

export const authRepository = {
    async findByUsername(
        db: DbClient,
        username: string
    ) {
        return db.user.findUnique({
            where: {
                username,
            },

            include: {
                role: true,
                branch: true,
            },
        });
    }
};

