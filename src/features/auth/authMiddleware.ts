import { AuthenticationError } from "@/errors/AuthenticationError";
import { NextRequest } from "next/server";
import { CurrentUser } from "./authTypes";
import { verifyToken } from "./jwt";


export async function authenticate(
    request: NextRequest
): Promise<CurrentUser> {
    //console.log(request);
    const authorization =
        request.headers.get("authorization");

    if (!authorization) {

        throw new AuthenticationError(
            "Authorization header missing."
        );
    }

    if (
        !authorization.startsWith("Bearer ")
    ) {

        throw new AuthenticationError(
            "Invalid authorization header."
        );

    }

    const token =
        authorization.replace(
            "Bearer ",
            ""
        );

    const payload =
        verifyToken(token);

    return {

        id: payload.userId,

        username: payload.username,

        roleCode: payload.roleCode,

        branchId: payload.branchId,

    };
}