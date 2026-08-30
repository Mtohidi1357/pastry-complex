import jwt from "jsonwebtoken";

import type { JwtPayload } from "./authTypes";

export function createToken(
    payload: JwtPayload
) {
    const JWT_SECRET =
        process.env.JWT_SECRET;

    if (!JWT_SECRET) {

        throw new Error(
            "JWT_SECRET is not configured."
        );

    }

    return jwt.sign(

        payload,

        JWT_SECRET,

        {

            expiresIn: "8h",

        }

    );
}

export function verifyToken(
    token: string
): JwtPayload {
    const JWT_SECRET =
        process.env.JWT_SECRET;

    if (!JWT_SECRET) {

        throw new Error(
            "JWT_SECRET is not configured."
        );

    }
    return jwt.verify(

        token,

        JWT_SECRET,

    ) as JwtPayload;

}
