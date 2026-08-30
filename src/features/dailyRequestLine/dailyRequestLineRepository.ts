import { DailyRequestLine, Prisma } from "@/generated/prisma/client";
import { DbClient } from "@/repositories/types";
import {
    RecordInventoryDTO,
    RecordProductionDTO,
    RecordReceivingDTO,
    RecordRequestDTO,
} from "./dailyRequestLineTypes";

export const dailyRequestLineRepository = {
    async addLine(
        db: DbClient,
        data: Prisma.DailyRequestLineCreateInput,
    ): Promise<DailyRequestLine> {

        return db.dailyRequestLine.create({
            data,
        })
    },

    async removeLine(
        db: DbClient,
        requestId: string,
        lineId: string,
    ): Promise<boolean> {

        await db.dailyRequestLine.delete({
            where: {
                id: lineId,
                dailyRequestId: requestId,
            }
        });
        return true; //Unnecessary line of code ...
    },

    async findById(
        db: DbClient,
        lineId: string
    ): Promise<DailyRequestLine | null> {
        return db.dailyRequestLine.findUnique({
            where: {
                id: lineId
            },
        })
    },

    async updateProdQuantity(
        db: DbClient,
        lineId: string,
        quantities: RecordProductionDTO,
    ): Promise<DailyRequestLine | null> {

        // Build a dynamic data object — only include what was passed
    const data: Prisma.DailyRequestLineUpdateInput = {};
    
    if (quantities.producedQty !== undefined) {
        data.producedQty = quantities.producedQty;
    }
    
    // If nothing to update, bail out early
    if (Object.keys(data).length === 0) {
        return null;
    }
        return db.dailyRequestLine.update({
        where: { id: lineId },
        data,
    });      
    },

    async updateRequestQuantity(
        db: DbClient,
        lineId: string,
        quantities: RecordRequestDTO,
    ): Promise<DailyRequestLine | null> {

    const data: Prisma.DailyRequestLineUpdateInput = {};

    if (quantities.requestedQty !== undefined) {
        data.requestedQty = quantities.requestedQty;
    }
    
    // If nothing to update, bail out early
    if (Object.keys(data).length === 0) {
        return null;
    }
        return db.dailyRequestLine.update({
        where: { id: lineId },
        data,
    });      
    },

    async updateInventoryQuantity(
        db: DbClient,
        lineId: string,
        quantities: RecordInventoryDTO,
    ): Promise<DailyRequestLine | null> {

    const data: Prisma.DailyRequestLineUpdateInput = {
        requestedQty: quantities.requestedQty,
        previousBalance: quantities.previousBalance,
        currentBalance: quantities.currentBalance,
        reportTime: new Date(),
    };

    return db.dailyRequestLine.update({
        where: { id: lineId },
        data,
    });      
    },

    async updateRecivingQuantity(
        db: DbClient,
        lineId: string,
        quantities: RecordReceivingDTO,
    ): Promise<DailyRequestLine | null> {

    const data: Prisma.DailyRequestLineUpdateInput = {};

    if (quantities.receivedQty !== undefined) {
        data.receivedQty = quantities.receivedQty;
    }
    
    // If nothing to update, bail out early
    if (Object.keys(data).length === 0) {
        return null;
    }
        return db.dailyRequestLine.update({
        where: { id: lineId },
        data,
    });      
    },
    
    async existsProductInRequest(
        db: DbClient,
        productId: string,
        requestId: string,
    ): Promise<{id: string} | null> {
        return db.dailyRequestLine.findFirst({
                where: {
                    dailyRequestId: requestId,
                    productId,
                },
                select: {
                    id: true,
                },
            })
    },
}
