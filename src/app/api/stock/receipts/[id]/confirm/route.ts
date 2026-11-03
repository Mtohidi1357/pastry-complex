import type { NextRequest } from "next/server";
import { z } from "zod";
import { stockHttp } from "@/features/stock/stockHttp";
import { confirmReceipt } from "@/features/stock/stockService";
import { assertStockWrite } from "@/features/stock/stockPolicy";
import { confirmReceiptBody } from "@/features/stock/stockValidation";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return stockHttp(req, async user => {
        assertStockWrite(user, "receive");
        const body = confirmReceiptBody.parse(await req.json());
        return confirmReceipt(user, z.uuid().parse((await params).id), body.version);
    });
}
