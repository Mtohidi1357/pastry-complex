import type { NextRequest } from "next/server";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { workshopOptions } from "@/features/workshop/workshopService";
export async function GET(req: NextRequest) { return workshopHttp(req, workshopOptions); }
