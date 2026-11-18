import type { NextRequest } from "next/server";
import { salesHttp } from "@/features/sales/salesHttp";
import { salesOptions } from "@/features/sales/salesService";
export async function GET(req: NextRequest) { return salesHttp(req, salesOptions); }
