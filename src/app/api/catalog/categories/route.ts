import type { NextRequest } from "next/server";
import { catalogHttp } from "@/features/catalog/catalogHttp";
import { createCategory } from "@/features/catalog/catalogService";
import { categoryBody } from "@/features/catalog/catalogValidation";
export async function POST(req: NextRequest) { return catalogHttp(req, async user => createCategory(user, categoryBody.parse(await req.json())), 201); }
