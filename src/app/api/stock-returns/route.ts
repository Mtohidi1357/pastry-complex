import type { NextRequest } from "next/server";
import { returnHttp } from "@/features/returns/returnHttp";
import { createReturn, returnList } from "@/features/returns/returnService";
import { returnCreateBody, returnQuery } from "@/features/returns/returnValidation";
export async function GET(req: NextRequest) { return returnHttp(req, async user => { const q = returnQuery.parse(Object.fromEntries(req.nextUrl.searchParams)); return returnList(user, q.page, q.showFinished ?? false, q.reference); }); }
export async function POST(req: NextRequest) { return returnHttp(req, async user => createReturn(user, returnCreateBody.parse(await req.json())), 201); }
