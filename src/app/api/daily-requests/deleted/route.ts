import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { listDeletedRequests } from "@/features/dailyRequest/requestRestoreService";

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1) }).strict();

export async function GET(req: NextRequest) {
    return authenticatedRead(req, user => {
        const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        return listDeletedRequests(user, query.page);
    });
}
