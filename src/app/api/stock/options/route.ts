import type { NextRequest } from "next/server";
import { stockHttp } from "@/features/stock/stockHttp";
import { stockOptions } from "@/features/stock/stockService";
export async function GET(req: NextRequest) { return stockHttp(req, user => stockOptions(user)); }
