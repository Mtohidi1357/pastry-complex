import type { NextRequest } from "next/server";
import { z } from "zod";
import { salesHttp } from "@/features/sales/salesHttp";
import { actOnSales, salesLease } from "@/features/sales/salesService";
import { salesActionBody } from "@/features/sales/salesValidation";
import { deliveryLeaseBody } from "@/features/delivery/deliveryValidation";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(req: NextRequest, { params }: Context) { return salesHttp(req, async user => {
    const p = await params, id = z.uuid().parse(p.id);
    if (p.action === "edit-lease") { const body = deliveryLeaseBody.parse(await req.json()); return salesLease(user, id, body.token, body.action); }
    const action = z.enum(["submit", "review", "post", "reverse", "cancel"]).parse(p.action);
    return actOnSales(user, id, action, salesActionBody.parse(await req.json()), req.headers.get("X-Stock-Edit-Token") ?? undefined);
}); }
