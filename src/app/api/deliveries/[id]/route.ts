import type { NextRequest } from "next/server";
import { z } from "zod";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { deliveryDetail } from "@/features/delivery/deliveryService";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) { return workshopHttp(req, async user => deliveryDetail(user, z.uuid().parse((await params).id))); }
