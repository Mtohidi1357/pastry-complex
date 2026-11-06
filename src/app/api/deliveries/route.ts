import type { NextRequest } from "next/server";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { createDelivery, deliveryList } from "@/features/delivery/deliveryService";
import { createDeliveryBody, deliveryQuery } from "@/features/delivery/deliveryValidation";
export async function GET(req: NextRequest) {
    return workshopHttp(req, async user => { const q = deliveryQuery.parse(Object.fromEntries(req.nextUrl.searchParams)); return deliveryList(user, q.page, q.showFinished ?? false, q.reference); });
}
export async function POST(req: NextRequest) {
    return workshopHttp(req, async user => createDelivery(user, createDeliveryBody.parse(await req.json())), 201);
}
