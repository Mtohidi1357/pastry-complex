import type { NextRequest } from "next/server";
import { wasteHttp } from "@/features/waste/wasteHttp";
import { createWaste, wasteList } from "@/features/waste/wasteService";
import { createWasteBody, wasteQuery } from "@/features/waste/wasteValidation";
export async function GET(req: NextRequest) { return wasteHttp(req, user => { const q = wasteQuery.parse(Object.fromEntries(req.nextUrl.searchParams)); return wasteList(user, q.page, q.showFinished, q.branchId, q.tasks, q.reference); }); }
export async function POST(req: NextRequest) { return wasteHttp(req, async user => createWaste(user, createWasteBody.parse(await req.json())), 201); }
