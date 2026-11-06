import type { NextRequest } from "next/server";
import { z } from "zod";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { actOnWorkshop } from "@/features/workshop/workshopService";
import { workshopActionBody } from "@/features/workshop/workshopValidation";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(req: NextRequest, { params }: Context) { return workshopHttp(req, async user => { const p = await params, id = z.uuid().parse(p.id), action = z.enum(["post", "reverse", "cancel"]).parse(p.action), body = workshopActionBody.parse(await req.json()); return actOnWorkshop(user, id, body.version, body.reason, action, req.headers.get("X-Stock-Edit-Token") ?? undefined); }); }
