import type { NextRequest } from "next/server";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { monitorOptions } from "@/features/monitor/monitorService";
export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => monitorOptions(user));
}
