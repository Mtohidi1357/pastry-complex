import type { NextRequest } from "next/server";
import { stockHttp } from "@/features/stock/stockHttp";
import { countOptions } from "@/features/stock/countService";
export async function GET(req: NextRequest) { return stockHttp(req, user => countOptions(user)); }
