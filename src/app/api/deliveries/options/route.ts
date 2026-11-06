import type { NextRequest } from "next/server";
import { workshopHttp } from "@/features/workshop/workshopHttp";
import { deliveryOptions } from "@/features/delivery/deliveryService";
export async function GET(req: NextRequest) { return workshopHttp(req, deliveryOptions); }
