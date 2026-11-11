import type { NextRequest } from "next/server";
import { z } from "zod";
import { returnHttp } from "@/features/returns/returnHttp";
import { returnDetail, saveReturn } from "@/features/returns/returnService";
import { returnSaveBody } from "@/features/returns/returnValidation";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) { return returnHttp(req, async user => returnDetail(user, z.uuid().parse((await params).id))); }
export async function PATCH(req: NextRequest, { params }: Context) { return returnHttp(req, async user => saveReturn(user, z.uuid().parse((await params).id), returnSaveBody.parse(await req.json()), req.headers.get("X-Stock-Edit-Token") ?? undefined)); }
