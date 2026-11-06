import type { NextRequest } from "next/server";
import { z } from "zod";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { workshopDetail, saveWorkshop } from "@/features/workshop/workshopService";
import { saveWorkshopBody } from "@/features/workshop/workshopValidation";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) { return workshopHttp(req, async user => workshopDetail(user, z.uuid().parse((await params).id))); }
export async function PATCH(req: NextRequest, { params }: Context) { return workshopHttp(req, async user => saveWorkshop(user, z.uuid().parse((await params).id), saveWorkshopBody.parse(await req.json()), req.headers.get("X-Stock-Edit-Token") ?? undefined)); }
