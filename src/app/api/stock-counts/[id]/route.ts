import type { NextRequest } from "next/server";
import { z } from "zod";
import { stockHttp } from "@/features/stock/stockHttp";
import { stockScope } from "@/features/stock/stockPolicy";
import { countRole, countDetail, saveCount } from "@/features/stock/countService";
import { saveCountBody } from "@/features/stock/countValidation";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) {
    return stockHttp(req, async user => { stockScope(user); return countDetail(user, z.uuid().parse((await params).id)); });
}
export async function PATCH(req: NextRequest, { params }: Context) {
    return stockHttp(req, async user => { countRole(user, "INV"); return saveCount(user, z.uuid().parse((await params).id), saveCountBody.parse(await req.json())); });
}
