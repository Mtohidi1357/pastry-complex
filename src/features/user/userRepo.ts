import { UserQuerySchemaDto } from "@/validation/userSchema";
import { DbClient } from "../../repositories/types";

export const userRepository = {
    async findUser(
        db: DbClient,
        query: UserQuerySchemaDto,
    ) {
        if (!query.branchId && !query.username) {
            throw new Error("At least one search criterion is required");
        }

        return db.user.findFirst(
            {
                where: {
                    ...(query.branchId && {
                        branchId: query.branchId,
                    }),

                    ...(query.username && {
                        username: query.username,
                    }),
                },
            }
        )
    }
}