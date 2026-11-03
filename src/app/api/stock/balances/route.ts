import type { NextRequest } from "next/server";
import { stockHttp } from "@/features/stock/stockHttp";
import { stockList } from "@/features/stock/stockService";
import { stockScope } from "@/features/stock/stockPolicy";
import { stockQuery } from "@/features/stock/stockValidation";
export async function GET(req: NextRequest) {
    return stockHttp(req, user => {
        stockScope(user);
        const query = stockQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
        return stockList(user, "balances", query.page, query.branchId, query.productId, query.sourceType);
    });
}
