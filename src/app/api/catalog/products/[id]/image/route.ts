import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import type { CurrentUser, JwtPayload } from "@/features/auth/authTypes";
import { authenticate } from "@/features/auth/authMiddleware";
import { verifyToken } from "@/features/auth/jwt";
import { AuthenticationError } from "@/errors/AuthenticationError";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { failure } from "@/lib/centralResponse";
import { catalogHttp } from "@/features/catalog/catalogHttp";
import { productImage, uploadProductImage, removeProductImage } from "@/features/catalog/catalogService";
import { productImageForm } from "@/features/catalog/productImage";
import { imageVersionBody } from "@/features/catalog/catalogValidation";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: Context) {
    try {
        // Browser images send the same-origin login cookie, not a bearer header.
        let user: CurrentUser;
        if (req.headers.has("authorization")) user = await authenticate(req);
        else {
            const cookie = req.cookies.get("token")?.value; if (!cookie) throw new AuthenticationError("Sign in to view product photos.");
            let payload: JwtPayload;
            try { payload = verifyToken(cookie); } catch { throw new AuthenticationError("Your login expired. Sign in again."); }
            user = { id: payload.userId, username: payload.username, roleCode: payload.roleCode, branchId: payload.branchId };
        }
        const image = await productImage(user, z.uuid().parse((await params).id));
        const buffer = new ArrayBuffer(image.data.byteLength); new Uint8Array(buffer).set(image.data);
        return new Response(buffer, { headers: { "Content-Type": image.mime, "Content-Length": String(buffer.byteLength), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
    } catch (error) {
        if (error instanceof AppError) return failure(error.code, error.message, error.status, error.details);
        if (error instanceof ZodError) return failure(ApiErrorCode.VALIDATION_ERROR, "Invalid product ID.", 400);
        console.error(error);
        return failure(ApiErrorCode.UNKNOWN_ERROR, "Product photo could not be loaded.", 500);
    }
}
export async function POST(req: NextRequest, { params }: Context) {
    return catalogHttp(req, async user => {
        const id = z.uuid().parse((await params).id), form = await productImageForm(req), file = form.get("file");
        if (!(file instanceof File)) throw new AppError(ApiErrorCode.VALIDATION_ERROR, "Choose a photo file.", 400);
        const { version } = imageVersionBody.parse({ version: Number(form.get("version")) });
        return uploadProductImage(user, id, version, new Uint8Array(await file.arrayBuffer()));
    });
}
export async function DELETE(req: NextRequest, { params }: Context) { return catalogHttp(req, async user => { const id = z.uuid().parse((await params).id), body = imageVersionBody.parse(await req.json()); return removeProductImage(user, id, body.version); }); }
