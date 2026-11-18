import type { NextRequest } from "next/server";
import { salesHttp } from "@/features/sales/salesHttp";
import { createSales, salesList } from "@/features/sales/salesService";
import { salesCreateBody, salesQuery } from "@/features/sales/salesValidation";
export async function GET(req: NextRequest) { return salesHttp(req, async user => { const q = salesQuery.parse(Object.fromEntries(req.nextUrl.searchParams)); return salesList(user, q.page, q.showFinished ?? false, q.reference, q.branchId, q.businessDate, q.status); }); }
export async function POST(req: NextRequest) { return salesHttp(req, async user => createSales(user, salesCreateBody.parse(await req.json())), 201); }
