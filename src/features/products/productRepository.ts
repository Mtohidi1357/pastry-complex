import { DbClient } from "../../repositories/types";

export const productRepository = {
    async listActive(
        db: DbClient
    ) {
        return db.product.findMany({
            where: {
                isActive: true,
            },

            orderBy: {
                productionOrder: "asc",
            },
        });
    },

    async findActiveById(
        db: DbClient,
        productId: string,
    ) {
        return db.product.findUnique({
            where: {
                id: productId,
                isActive: true,
            }
        })
    }
}