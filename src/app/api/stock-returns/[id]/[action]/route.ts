import type { NextRequest } from "next/server";
import { z } from "zod";
import { returnHttp } from "@/features/returns/returnHttp";
import { actOnReturn, returnLease } from "@/features/returns/returnService";
import { returnActionBody } from "@/features/returns/returnValidation";
import { deliveryLeaseBody } from "@/features/delivery/deliveryValidation";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(req: NextRequest, { params }: Context) { return returnHttp(req, async user => {
    const p = await params, id = z.uuid().parse(p.id);
    if (p.action === "edit-lease") { const body = deliveryLeaseBody.parse(await req.json()); return returnLease(user, id, body.token, body.action); }
    const action = z.enum(["submit", "review", "dispatch", "receive", "restore", "cancel"]).parse(p.action);
    return actOnReturn(user, id, action, returnActionBody.parse(await req.json()), req.headers.get("X-Stock-Edit-Token") ?? undefined);
}); }
