import type { NextRequest } from "next/server";
import { wasteHttp } from "@/features/waste/wasteHttp";
import { wasteOptions } from "@/features/waste/wasteService";
export async function GET(req: NextRequest) { return wasteHttp(req, wasteOptions); }
