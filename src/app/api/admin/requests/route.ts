import type { NextRequest } from "next/server";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { monitorRequests } from "@/features/monitor/monitorService";
export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => monitorRequests(user, req.nextUrl.searchParams));
}
