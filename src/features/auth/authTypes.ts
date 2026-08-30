import { RoleCode } from "@/lib/constants/roles";

export interface JwtPayload {

    userId: string;

    username: string;

    roleCode: RoleCode;

    branchId: string;

}

export interface CurrentUser {

    id: string;

    username: string;

    roleCode: RoleCode;

    branchId: string;

}

export interface LoggedInUser {
    id: string,
    username: string,
    firstName: string,
    lastName: string,

    role: {
        code: string,
        name: string,
        displayName: string,
    },

    branch: {
        id: string,
        code: string,
        name: string,
        displayName: string,
        type: string,
    },
}