import { DailyRequest, RequestStatus, User } from "@/generated/prisma/client";
import { CurrentUser } from "../auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import {
    getTargetStatus,
    transitionActions,
    validTransition
} from "../workflow/transitionValidator";
import { canPerformAction, PermissionRequest } from "../workflow/permissionService";
import { RequestCapabilities } from "../requestPolicy/requestCapabilities";
import { WorkflowDefinition, WorkflowAction } from "../workflow/wrokFlowDefinition";

export interface RequestPolicyContext {
    request: DailyRequest;

    currentUser: CurrentUser;
}

export interface PolicyResult {

    allowed: boolean;

    reason?: string;

}

export const requestPolicy = {

    canView(
        context: RequestPolicyContext
    ): PolicyResult {
        return {
            allowed: true,
        };
    },

    canEdit(
        context: RequestPolicyContext
    ): PolicyResult {
        const { request, currentUser } = context;

        //Already deleted ...
        if (request.deletedAt) {
            return {
                allowed: false,
                reason: "Request has already been deleted."
            };
        }

        //Administrator can always edit ...
        if (currentUser.roleCode === Roles.ADMIN) {
            return {
                allowed: true,
            };
        }

        //Creator may edit own draft ...
        if (
            request.createdById === currentUser.id &&
            request.status === RequestStatus.DRAFT
        ) {
            return {
                allowed: true,
            };
        }

        //Branch manager can edit until the workflow finishes ...
        if (
            request.status !== RequestStatus.DRAFT &&
            request.status !== RequestStatus.WORKSHOP_PROCESSING &&
            request.status !== RequestStatus.CLOSED &&
            currentUser.roleCode === Roles.BM
        ) {
            return {
                allowed: true,
            };
        }

        if(
            (request.status === RequestStatus.WORKSHOP_PROCESSING ||
             request.status === RequestStatus.MANAGER_SUBMITTED) &&
            currentUser.roleCode === Roles.WM
        ) {
            return {
                allowed: true
            }
        }

        return {
            allowed: false,
            reason: "You are not allowed to edit this request."
        };
    },

    canDelete(
        context: RequestPolicyContext
    ): PolicyResult {
        const { request, currentUser } = context;

        // Already deleted
        if (request.deletedAt) {
            return {
                allowed: false,
                reason: "Request has already been deleted.",
            };
        }

        // Administrator
        if (currentUser.roleCode === Roles.ADMIN) {
            return {
                allowed: true,
            };
        }

        // Creator may delete own draft
        if (request.createdById === currentUser.id &&
            request.status === RequestStatus.DRAFT) {
            return {
                allowed: true,
            }
        }

        // Branch Manager
        if (
            currentUser.roleCode === Roles.BM &&
            request.status !== RequestStatus.COMPLETED &&
            request.status !== RequestStatus.CLOSED
        ) {
            return {
                allowed: true,
            };
        }

        return {
            allowed: false,
            reason: "You are not allowed to delete this request.",
        };
    },

    canCancel(
        context: RequestPolicyContext,
    ): PolicyResult {
        const { request, currentUser } = context;

        //Already cancelled ...
        if (request.status === RequestStatus.CANCELLED) {
            return {
                allowed: false,
                reason: "The request is already cancelled."
            };
        }

        //Admin is always allowed ...
        if (currentUser.roleCode === Roles.ADMIN) {
            return {
                allowed: true,
            }
        }

        // Creator may cancel own draft ...
        if (request.createdById === currentUser.id &&
            request.status === RequestStatus.DRAFT) {
            return {
                allowed: true,
            }
        }

        //Check definition ...
        const transitions =
            WorkflowDefinition[request.status]
                ?.transitions[WorkflowAction.CANCEL_REQUEST];
        if (!transitions) {
            return {
                allowed: false,
                reason: "Cancellation is not allowed from this status.",
            }
        }

        //Check the role ...
        if (!transitions.roles.includes(currentUser.roleCode)) {
            return {
                allowed: false,
                reason: "Your role cannot cancel request in this status."
            }
        }

        return {
            allowed: false,
            reason: "You are not allowed to cancel this request."
        }
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

    canTransition(
        context: RequestPolicyContext
    ) {
    },

    canProduce(
        context: RequestPolicyContext,
    ): PolicyResult {
        const { request, currentUser } = context;

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

        for (const action of transitionActions) {

            const target = getTargetStatus(action);

            if (!target) continue;

            if (!validTransition(request.status, target)) continue;

            const argPermissionReq: PermissionRequest = {
                roleCode: currentUser.roleCode,
                currentStatus: request.status,
                action: action
            }

            if (
                canPerformAction(argPermissionReq)
            ) {
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

