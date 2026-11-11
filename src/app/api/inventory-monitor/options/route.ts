import type { NextRequest } from "next/server";
import { authenticatedRead } from "@/lib/authenticatedRead";
import { inventoryOptions } from "@/features/inventory/inventoryService";
export async function GET(req: NextRequest) { return authenticatedRead(req, inventoryOptions); }
