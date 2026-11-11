import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { inventoryReport } from "@/features/inventory/inventoryService";
import { showFinishedQuery } from "@/lib/listVisibility";
const query = z.object({ view: z.enum(["balances", "transit", "movements"]).default("balances"), page: z.coerce.number().int().min(1).max(100_000).default(1), branchId: z.uuid().optional(), productId: z.uuid().optional(), locationType: z.enum(["SALES", "BAKERY"]).optional(), includeZero: showFinishedQuery }).strict();
export async function GET(req: NextRequest) { return authenticatedRead(req, user => inventoryReport(user, query.parse(Object.fromEntries(req.nextUrl.searchParams)))); }
