import type { NextRequest } from "next/server";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { createWorkshop, workshopList } from "@/features/workshop/workshopService";
import { createWorkshopBody, workshopQuery } from "@/features/workshop/workshopValidation";
export async function GET(req: NextRequest) { return workshopHttp(req, user => { const q = workshopQuery.parse(Object.fromEntries(req.nextUrl.searchParams)); return workshopList(user, q.view, q.page, q.showFinished, q.branchId, q.productId, q.sourceType, q.reference); }); }
export async function POST(req: NextRequest) { return workshopHttp(req, async user => createWorkshop(user, createWorkshopBody.parse(await req.json())), 201); }
