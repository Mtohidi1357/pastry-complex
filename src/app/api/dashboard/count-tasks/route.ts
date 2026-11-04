import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { showFinishedQuery } from "@/lib/listVisibility";
import { managerCountTasks } from "@/features/dashboard/countTaskService";
const querySchema = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1), showFinished: showFinishedQuery }).strict();
export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => {
        const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        return managerCountTasks(user, query.page, query.showFinished);
    });
}
