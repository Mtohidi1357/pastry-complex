import type { NextRequest } from "next/server";
import { z } from "zod";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { deliveryAction, deliveryLease } from "@/features/delivery/deliveryService";
import { deliveryActionBody, deliveryLeaseBody } from "@/features/delivery/deliveryValidation";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(req: NextRequest, { params }: Context) {
    return workshopHttp(req, async user => {
        const p = await params, id = z.uuid().parse(p.id);
        if (p.action === "edit-lease") { const body = deliveryLeaseBody.parse(await req.json()); return deliveryLease(user, id, body.token, body.action); }
        const action = z.enum(["dispatch", "receive", "return", "cancel"]).parse(p.action), body = deliveryActionBody.parse(await req.json());
        return deliveryAction(user, id, action, body, req.headers.get("X-Stock-Edit-Token") ?? undefined);
    });
}
