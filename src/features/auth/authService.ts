import { prisma } from "@/lib/prisma";
import { authRepository } from "./authRepository";
import { verifyPassword } from "./password";
import { createToken } from "./jwt";
import { AuthenticationError } from "@/errors/AuthenticationError";
import { JwtPayload, LoggedInUser } from "./authTypes";
import { RoleCode } from "@/lib/constants/roles";


export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResult {
    success: boolean;
    token: string;
    user: LoggedInUser;
}

export async function login(
    request: LoginRequest
): Promise<LoginResult> {
    const user =
        await authRepository.findByUsername(
            prisma,
            request.username
        );

    if (!user) {
        throw new AuthenticationError(
            "Invalid username or password."
        );
    }

    if (!user.isActive) {
        throw new AuthenticationError(
            "User is inactive."
        );
    }

    const valid =
        await verifyPassword(
            request.password,
            user.passwordHash,
        );

    if (!valid) {
        throw new AuthenticationError(
            "Invalid username or password."
        );
    }

    const payload: JwtPayload = {
        userId: user.id,
        username: user.username,
        roleCode: user.role.code as RoleCode,
        branchId: user.branch.id,
    };

    const token =
        createToken(payload);
    return {
        success: true,
        token,
        user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,

        role: {
            code: user.role.code,
            name: user.role.name,
            displayName: user.role.displayName,
        },

        branch: {
            id: user.branch.id,
            code: user.branch.code,
            name: user.branch.name,
            displayName: user.branch.displayName,
            type: user.branch.type,
        },
    },
};
}