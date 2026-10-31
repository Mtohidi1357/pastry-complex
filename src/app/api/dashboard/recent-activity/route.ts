import type { NextRequest } from "next/server";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { getRecentActivity } from "@/features/workflow/workflowService";

export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => getRecentActivity(user));
}
