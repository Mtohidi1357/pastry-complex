import type { NextRequest } from "next/server";
import { z } from "zod";
import { stockHttp } from "@/features/stock/stockHttp";
import { reverseReceipt } from "@/features/stock/stockService";
import { assertStockWrite } from "@/features/stock/stockPolicy";
import { reverseReceiptBody } from "@/features/stock/stockValidation";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return stockHttp(req, async user => {
        assertStockWrite(user, "reverse");
        const body = reverseReceiptBody.parse(await req.json());
        return reverseReceipt(user, z.uuid().parse((await params).id), body.version, body.reason);
    });
}
