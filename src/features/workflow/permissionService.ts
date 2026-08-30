import { RequestStatus } from "../../generated/prisma/enums";
import { WorkflowAction } from "./wrokFlowDefinition";
import { Roles, RoleCode } from "@/lib/constants/roles"

export interface PermissionResult {
    allowed: boolean;
    reason?: string;
}

export interface PermissionRequest {
    roleCode: RoleCode;

    currentStatus: RequestStatus;

    action: WorkflowAction;
}

export function canPerformAction(
    request: PermissionRequest
): PermissionResult {
    switch (request.roleCode) {
        case Roles.ADMIN:
            return {
                allowed: true,
            };

        case Roles.INV:
            return canInventoryPerform(request);

        case Roles.BM:
            return canBranchManagerPerform(request);

        case Roles.WM:
            return canWorkshopManagerPerform(request);

        default:
            return {
                allowed: false,
                reason: `Unknown Role Submitted: ${request.roleCode}`
            };
    }
}

function canBranchManagerPerform(
    request: PermissionRequest
): PermissionResult {

    if(request.action !== WorkflowAction.SUBMIT_MANAGER && request.action !== WorkflowAction.CLOSE_REQUEST) {
        return {
            allowed: false,
            reason: "Branch managers cannot perform this action."
        }
    }

    if(request.currentStatus !== RequestStatus.INVENTORY_SUBMITTED && request.currentStatus !== RequestStatus.COMPLETED){
        return {
            allowed: false,
            reason: "Only INVENTORY_SUBMITTED and COMPLETED requests can be submitted."
        }
    }

    return {
        allowed: true,
    }
}

function canInventoryPerform(
    request: PermissionRequest
): PermissionResult {
    if (
        request.action !== WorkflowAction.SUBMIT_INVENTORY &&
        request.action !== WorkflowAction.CANCEL_REQUEST
    ) {
        return {
            allowed: false,
            reason: "Inventory users cannot perform this action."
        };
    }

    if (request.currentStatus !== RequestStatus.DRAFT) {
        return {
            allowed: false,
            reason: "Only draft requests can be submitted."
        };
    }

    return {
        allowed: true,
    };
}

function canWorkshopManagerPerform(
    request: PermissionRequest
): PermissionResult {

    if(request.action !== WorkflowAction.START_PRODUCTION && request.action !== WorkflowAction.COMPLETE_PRODUCTION) {
        return {
            allowed: false,
            reason: "Workshop manager is not allowed to perform this action."
        }
    }

    if(request.currentStatus !== RequestStatus.MANAGER_SUBMITTED && request.currentStatus !== RequestStatus.WORKSHOP_PROCESSING){
        return {
            allowed: false,
            reason: "Only MANAGER_SUBMITTED and WORKSHOP_PROCESSING requests can be submitted."
        }
    }

    return {
        allowed: true,
    }
}