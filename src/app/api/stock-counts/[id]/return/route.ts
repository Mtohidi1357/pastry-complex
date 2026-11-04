import type { NextRequest } from "next/server";
import { z } from "zod";
import { stockHttp } from "@/features/stock/stockHttp";
import { countRole, decideCount } from "@/features/stock/countService";
import { countDecisionBody } from "@/features/stock/countValidation";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return stockHttp(req, async user => { countRole(user, "BM"); const body = countDecisionBody.parse(await req.json()); return decideCount(user, z.uuid().parse((await params).id), body.version, body.reason, false); });
}
