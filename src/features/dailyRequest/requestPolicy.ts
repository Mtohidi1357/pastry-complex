import { type DailyRequest, RequestStatus } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import {
    getTargetStatus,
    transitionActions,
    validTransition
} from "../workflow/transitionValidator";
import { canPerformAction, type PermissionRequest } from "../workflow/permissionService";
import type { RequestCapabilities } from "../requestPolicy/requestCapabilities";
import { WorkflowAction } from "../workflow/wrokFlowDefinition";
export interface RequestPolicyContext {
    request: DailyRequest;

    currentUser: CurrentUser;
}

export interface PolicyResult {

    allowed: boolean;

    reason?: string;

}

function checkQuantityEditAccess({
    request,
    currentUser,
}: RequestPolicyContext): PolicyResult{
    if (request.deletedAt) {
        return{
            allowed: false,
            reason: "This request has already been deleted.",
        };
    }
    if (request.assignedToId !== currentUser.id) {
        return {
            allowed: false,
            reason: "This request is not assigned to you.",
        };
    }

    if (currentUser.roleCode !== Roles.WM && request.branchId !== currentUser.branchId) {
        return {
            allowed: false,
            reason: "You cannot edit requests from another branch.",
        };
    }

    return {allowed: true};
}

export const requestPolicy = {
    canView(
        context: RequestPolicyContext
    ): PolicyResult {
        const { request, currentUser} = context;

        if (request.deletedAt) {
            return {
                allowed: false,
                reason: "This request has been deleted.",
            };
        }

        if (currentUser.roleCode === Roles.ADMIN) {
            return {
                allowed: true
            };
        }
        if (
            (currentUser.roleCode === Roles.INV || currentUser.roleCode === Roles.BM) &&
            request.branchId === currentUser.branchId
         ) {
            return {allowed: true};
        }
        if (
            currentUser.roleCode === Roles.WM &&
            request.assignedToId === currentUser.id
        ) {
            return {allowed: true};
        }
        return {
            allowed: false,
            reason: "You are not allowed to view this request.",
        };
    },

    canEdit(context: RequestPolicyContext): PolicyResult {
        const access = checkQuantityEditAccess(context);
        if (!access.allowed) return access;

        const { request, currentUser } = context;
        const allowed =
            (currentUser.roleCode === Roles.INV &&
                request.status === RequestStatus.DRAFT) ||
            (currentUser.roleCode === Roles.BM &&
                (request.status === RequestStatus.INVENTORY_SUBMITTED ||
                 request.status === RequestStatus.COMPLETED)) ||
            (currentUser.roleCode === Roles.WM &&
                (request.status === RequestStatus.MANAGER_SUBMITTED ||
                 request.status === RequestStatus.WORKSHOP_PROCESSING));

        return allowed
            ? { allowed: true }
            : { allowed: false, reason: "Your role cannot edit this request at its current stage." };
    },
    canDelete(context: RequestPolicyContext): PolicyResult {
        const access = checkQuantityEditAccess(context);
        if (!access.allowed) return access;

        const { request, currentUser } = context;
        const allowed =
            (currentUser.roleCode === Roles.INV &&
                request.status === RequestStatus.DRAFT) ||
            (currentUser.roleCode === Roles.BM &&
                request.status === RequestStatus.INVENTORY_SUBMITTED);

        return allowed
            ? { allowed: true }
            : { allowed: false, reason: "Your role cannot delete this request at its current stage." };
    },
    canCancel(context: RequestPolicyContext): PolicyResult {
        const access = checkQuantityEditAccess(context);
        if (!access.allowed) return access;
        const { request, currentUser } = context;
        const allowed =
            (request.status === RequestStatus.DRAFT && currentUser.roleCode === Roles.INV) ||
            (request.status === RequestStatus.INVENTORY_SUBMITTED && currentUser.roleCode === Roles.BM);
        return allowed
            ? { allowed: true }
            : { allowed: false, reason: "Cancellation is allowed only before manager submission, by the assigned inventory user or branch manager." };
    },

    canRestore(
        context: RequestPolicyContext,
    ): PolicyResult {
        const { request, currentUser } = context;
        //Already deleted ...
        if (!request.deletedAt) {
            return {
                allowed: false,
                reason: "The request is not deleted.",
            };
        }

        //Administrator ....
        if (currentUser.roleCode === Roles.ADMIN) {
            return {
                allowed: true,
            };
        }
        //Branch manager ....
        if (currentUser.roleCode === Roles.BM) {
            return {
                allowed: true,
            };
        }

        //Workshop manager ....
        if (currentUser.roleCode === Roles.WM) {
            return {
                allowed: false,
            };
        }

        //Everyone else ...
        return {
            allowed: false,
            reason: "You are not allowed to restore this request.",
        };
    },

    canProduce(
        context: RequestPolicyContext,
    ): PolicyResult {
        const { request, currentUser } = context;
        const access = checkQuantityEditAccess(context);

        if (!access.allowed) {
            return access;
        }
        if (request.status !== RequestStatus.WORKSHOP_PROCESSING) {
            return {
                allowed: false,
                reason: "Only requests with WORKSHOP_PROCESSING status can be produced."
            }
        };

        if (currentUser.roleCode !== Roles.WM) {
            return {
                allowed: false,
                reason: "Only workshop manager can perform production."
            }
        };

        return {
            allowed: true,
        }

    },
    canRequest(
        context: RequestPolicyContext,
    ): PolicyResult {
        const { request, currentUser } = context;
        const access = checkQuantityEditAccess(context);

        if (!access.allowed) {
            return access;
        }
        if (request.status !== RequestStatus.DRAFT &&
            request.status !== RequestStatus.INVENTORY_SUBMITTED
        ) {
            return {
                allowed: false,
                reason: "Only requests with DRAFT and INVENTORY_SUBMITTED status can be requested."
            }
        };
        if (currentUser.roleCode !== Roles.INV &&
            currentUser.roleCode !== Roles.BM
        ) {
            return {
                allowed: false,
                reason: "Only INV and BM can request."
            }
        };

        return {
            allowed: true,
        }

    },

    canReceive(
        context: RequestPolicyContext,
    ): PolicyResult {
        const { request, currentUser } = context;
        const access = checkQuantityEditAccess(context);
        if (!access.allowed) {
            return access;
        }

        if (request.status !== RequestStatus.COMPLETED) {
            return {
                allowed: false,
                reason: "Only requests with COMPLETED status can be received."
            }
        };

        if (currentUser.roleCode !== Roles.BM) {
            return {
                allowed: false,
                reason: "Only BM can receive."
            }
        };
        return {
            allowed: true,
        }

    },

    getAvailableActions(
        context: RequestPolicyContext
    ): WorkflowAction[] {

        const actions: WorkflowAction[] = [];
        const { request, currentUser } = context;

        if (this.canEdit(context).allowed) {
            actions.push(WorkflowAction.EDIT_REQUEST);
        }

        if (this.canDelete(context).allowed) {
            actions.push(WorkflowAction.DELETE_REQUEST);
        }

        if (this.canRestore(context).allowed) {
            actions.push(WorkflowAction.RESTORE_REQUEST);
        }

        if (!checkQuantityEditAccess(context).allowed) return actions;

        for (const action of transitionActions) {
            if (action === WorkflowAction.CANCEL_REQUEST && !this.canCancel(context).allowed) continue;

            const target = getTargetStatus(action);

            if (!target) continue;

            if (!validTransition(request.status, target)) continue;
            const argPermissionReq: PermissionRequest = {
                roleCode: currentUser.roleCode,
                currentStatus: request.status,
                action: action
            }

            if (canPerformAction(argPermissionReq).allowed) {
                actions.push(action);
            }
        }

        return actions;
    },
    buildCapabilities(
        context: RequestPolicyContext
    ): RequestCapabilities {
        return {
            canEdit: requestPolicy.canEdit(context).allowed,

            canView: requestPolicy.canView(context).allowed,

            canDelete: requestPolicy.canDelete(context).allowed,

            canRestore: requestPolicy.canRestore(context).allowed,

            availableActions:
                requestPolicy.getAvailableActions(context),
        };
    },

};

