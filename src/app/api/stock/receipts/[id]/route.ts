import type { NextRequest } from "next/server";
import { z } from "zod";
import { stockHttp } from "@/features/stock/stockHttp";
import { receiptDetail, saveReceipt } from "@/features/stock/stockService";
import { stockScope, assertStockWrite } from "@/features/stock/stockPolicy";
import { saveReceiptBody } from "@/features/stock/stockValidation";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) {
    return stockHttp(req, async user => { stockScope(user); return receiptDetail(user, z.uuid().parse((await params).id)); });
}
export async function PATCH(req: NextRequest, { params }: Context) {
    return stockHttp(req, async user => {
        assertStockWrite(user, "receive");
        return saveReceipt(user, z.uuid().parse((await params).id), saveReceiptBody.parse(await req.json()));
    });
}
