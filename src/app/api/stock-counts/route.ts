import type { NextRequest } from "next/server";
import { stockHttp } from "@/features/stock/stockHttp";
import { stockScope } from "@/features/stock/stockPolicy";
import { countRole, listCounts, startCount } from "@/features/stock/countService";
import { countQuery, startCountBody } from "@/features/stock/countValidation";
export async function GET(req: NextRequest) {
    return stockHttp(req, user => { stockScope(user); const query = countQuery.parse(Object.fromEntries(req.nextUrl.searchParams)); return listCounts(user, query.page, query.branchId, query.showFinished); });
}
export async function POST(req: NextRequest) {
    return stockHttp(req, async user => { countRole(user, "INV"); return startCount(user, startCountBody.parse(await req.json())); }, 201);
}
