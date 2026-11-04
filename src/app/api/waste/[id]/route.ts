import type { NextRequest } from "next/server";
import { z } from "zod";
import { wasteHttp } from "@/features/waste/wasteHttp";
import { wasteDetail, saveWaste } from "@/features/waste/wasteService";
import { saveWasteBody } from "@/features/waste/wasteValidation";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) { return wasteHttp(req, async user => wasteDetail(user, z.uuid().parse((await params).id))); }
export async function PATCH(req: NextRequest, { params }: Context) { return wasteHttp(req, async user => saveWaste(user, z.uuid().parse((await params).id), saveWasteBody.parse(await req.json()))); }
