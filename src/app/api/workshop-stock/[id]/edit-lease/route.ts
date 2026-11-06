import type { NextRequest } from "next/server";
import { z } from "zod";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { workshopLease } from "@/features/workshop/workshopService";
import { deliveryLeaseBody } from "@/features/delivery/deliveryValidation";
type Context = { params: Promise<{ id: string }> };
export async function POST(req: NextRequest, { params }: Context) {
    return workshopHttp(req, async user => {
        const id = z.uuid().parse((await params).id), body = deliveryLeaseBody.parse(await req.json());
        return workshopLease(user, id, body.token, body.action);
    });
}
