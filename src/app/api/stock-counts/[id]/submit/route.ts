import type { NextRequest } from "next/server";
import { z } from "zod";
import { stockHttp } from "@/features/stock/stockHttp";
import { countRole, submitCount } from "@/features/stock/countService";
import { countVersionBody } from "@/features/stock/countValidation";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return stockHttp(req, async user => { countRole(user, "INV"); const body = countVersionBody.parse(await req.json()); return submitCount(user, z.uuid().parse((await params).id), body.version); });
}
