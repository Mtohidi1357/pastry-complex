import type { NextRequest } from "next/server";
import { catalogHttp } from "@/features/catalog/catalogHttp";
import { createProduct, listProducts } from "@/features/catalog/catalogService";
import { catalogQuery, createProductBody } from "@/features/catalog/catalogValidation";
export async function GET(req: NextRequest) { return catalogHttp(req, user => { const query = catalogQuery.parse(Object.fromEntries(req.nextUrl.searchParams)); return listProducts(user, query.page, query.includeInactive, query.categoryId, query.q); }); }
export async function POST(req: NextRequest) { return catalogHttp(req, async user => createProduct(user, createProductBody.parse(await req.json())), 201); }
