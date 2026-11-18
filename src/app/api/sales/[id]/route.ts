import type { NextRequest } from "next/server";
import { z } from "zod";
import { salesHttp } from "@/features/sales/salesHttp";
import { salesDetail, saveSales } from "@/features/sales/salesService";
import { salesSaveBody } from "@/features/sales/salesValidation";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) { return salesHttp(req, async user => salesDetail(user, z.uuid().parse((await params).id))); }
export async function PATCH(req: NextRequest, { params }: Context) { return salesHttp(req, async user => saveSales(user, z.uuid().parse((await params).id), salesSaveBody.parse(await req.json()), req.headers.get("X-Stock-Edit-Token") ?? undefined)); }
