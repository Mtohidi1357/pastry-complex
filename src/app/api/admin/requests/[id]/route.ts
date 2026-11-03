import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { monitorDetail, requireMonitor } from "@/features/monitor/monitorService";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return authenticatedRead(req, async user => {
        requireMonitor(user);
        const { id } = await params;
        z.uuid().parse(id);
        return monitorDetail(user, id);
    });
}
