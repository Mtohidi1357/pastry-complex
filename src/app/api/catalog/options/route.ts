import type { NextRequest } from "next/server";
import { catalogHttp } from "@/features/catalog/catalogHttp";
import { catalogOptions } from "@/features/catalog/catalogService";
export async function GET(req: NextRequest) { return catalogHttp(req, user => catalogOptions(user)); }
