import type { NextRequest } from "next/server";
import { z } from "zod";
import { wasteHttp } from "@/features/waste/wasteHttp";
import { actOnWaste } from "@/features/waste/wasteService";
import { wasteActionBody } from "@/features/waste/wasteValidation";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(req: NextRequest, { params }: Context) { return wasteHttp(req, async user => {
    const p = await params, id = z.uuid().parse(p.id), action = z.enum(["submit", "approve", "return", "reverse", "cancel"]).parse(p.action), body = wasteActionBody.parse(await req.json());
    return actOnWaste(user, id, body.version, body.reason, action);
}); }
