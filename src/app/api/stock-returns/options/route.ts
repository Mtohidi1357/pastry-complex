import type { NextRequest } from "next/server";
import { returnHttp } from "@/features/returns/returnHttp";
import { returnOptions } from "@/features/returns/returnService";
export async function GET(req: NextRequest) { return returnHttp(req, returnOptions); }
