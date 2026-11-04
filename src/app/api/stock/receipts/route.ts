import type { NextRequest } from "next/server";
import { stockHttp } from "@/features/stock/stockHttp";
import { stockList, createReceipt } from "@/features/stock/stockService";
import { stockScope, assertStockWrite } from "@/features/stock/stockPolicy";
import { stockQuery, createReceiptBody } from "@/features/stock/stockValidation";
export async function GET(req: NextRequest) {
    return stockHttp(req, user => {
        stockScope(user);
        const query = stockQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
        return stockList(user, "receipts", query.page, query.branchId, query.productId, query.sourceType, query.showFinished);
    });
}
export async function POST(req: NextRequest) {
    return stockHttp(req, async user => {
        assertStockWrite(user, "receive");
        return createReceipt(user, createReceiptBody.parse(await req.json()));
    }, 201);
}
