import type { NextRequest } from "next/server";
import { z } from "zod";
import { catalogHttp } from "@/features/catalog/catalogHttp";
import { productDetail, updateProduct } from "@/features/catalog/catalogService";
import { updateProductBody } from "@/features/catalog/catalogValidation";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) { return catalogHttp(req, async user => productDetail(user, z.uuid().parse((await params).id))); }
export async function PATCH(req: NextRequest, { params }: Context) { return catalogHttp(req, async user => updateProduct(user, z.uuid().parse((await params).id), updateProductBody.parse(await req.json()))); }
