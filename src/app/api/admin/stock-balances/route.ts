import type { NextRequest } from "next/server";
import { z } from "zod";
import { stockHttp } from "@/features/stock/stockHttp";
import { adminBalances, requireAdminBalances } from "@/features/stock/adminBalanceService";
const querySchema = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1), branchId: z.uuid().optional(), productId: z.uuid().optional() }).strict();
export async function GET(req: NextRequest) {
    return stockHttp(req, user => {
        requireAdminBalances(user);
        const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        return adminBalances(user, query.page, query.branchId, query.productId);
    });
}
