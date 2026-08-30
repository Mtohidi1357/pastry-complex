import { success, failure } from "@/lib/centralResponse";
import { ZodError } from "zod";
import { ApiErrorCode } from "@/types/api";
import { loginSchema } from "@/features/auth/authSchema";
import { AuthenticationError } from "@/errors/AuthenticationError";
import { login } from "@/features/auth/authService";


export async function POST(
    req: Request,
    {
        params,
    }: {
        params: Promise<{ id: string }>;
    }
) {
    try {
        const body = await req.json();
        
        const dto =
            loginSchema.parse(body);

        const token = await login(dto);
        //console.log("login route: " + JSON.stringify(token));
        return success(
            {
                message:
                    "Login completed.",
                token: token,
            },
            201
        );
    }
    catch (error) {
        console.error(error);
        if (error instanceof ZodError) {

            return failure(
                ApiErrorCode.VALIDATION_ERROR,
                "Validation Failed.",
                400,
                error.issues
            );
        }

        if (error instanceof AuthenticationError) {

            return failure(
                error.code,
                error.message,
                error.status,
                error.details,
            );
        }
        console.error(error);

        return failure(
            ApiErrorCode.UNKNOWN_ERROR,
            "Failed to login.",
            500
        );
    }

}