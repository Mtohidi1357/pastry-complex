import { prisma } from "@/lib/prisma";
import { dailyRequestRepository } from "@/features/dailyRequest/dailyRequestRepository";
import type { Prisma } from "@/generated/prisma/client";
import { 
    validTransition, 
    getTargetStatus,
    getTargetUser,
    // getTargetUser 
} from "./transitionValidator";
import {applyTransitionEffects} from "./transitionEffects";
import {ensureTransitionPreconditions} from "./transitionRequirements";
import { canPerformAction } from "./permissionService";
import { PermissionDeniedError } from "@/errors/PermissionDeniedError";
import { InvalidTransitionError } from "@/errors/InvalidTransitionError";
import { CurrentUser } from "../auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import { BusinessError } from "@/errors/BusinessError";
import { BusinessErrorCode } from "@/types/business";
import { userRepository } from "@/features/user/userRepo";
import { branchRepository } from "../branches/branchRepo";
import { WorkflowAction } from "./wrokFlowDefinition";

export interface TransitionRequest {
    requestId: string;

    currentUser: CurrentUser;

    action: WorkflowAction;

    note?: string;
}

export async function transition(
    request: TransitionRequest
) {
    const dailyRequest =
        await dailyRequestRepository.findByIdWithLines(
            prisma,
            request.requestId,
        );

    if (!dailyRequest) {
        throw new BusinessError(
            BusinessErrorCode.REQUEST_NOT_FOUND_ERROR,
            "Daily request not found."
        );
    };

    if(request.currentUser.id !== dailyRequest.assignedToId){
        throw new BusinessError(
            BusinessErrorCode.ASSIGNMENT_MISMATCH_ERROR,
            `This request is not assigned to the user ${request.currentUser.username}.`
        )
    }

    //Prohibiting inventory submission if no line exists ...
    const lineCheck = await ensureTransitionPreconditions(
        dailyRequest,
        request.action,
    );

    console.log(lineCheck.message);

    const targetStatus =
        getTargetStatus(request.action);

    if (targetStatus === undefined) {
        throw new BusinessError(
            BusinessErrorCode.NOT_A_WORKFLOW_TRANSITION,
            "This action is not a workflow transition."
        );
    }

    if (
        !validTransition(
            dailyRequest.status,
            targetStatus
        )
    ) {
        throw new InvalidTransitionError(
            dailyRequest.status,
            targetStatus
        );
    }

    const branchMatch = (dailyRequest.branchId === request.currentUser.branchId);

    if (!branchMatch && request.currentUser.roleCode !== Roles.WM) {
        throw new BusinessError(
            BusinessErrorCode.BRANCH_MISMATCH_ERROR,
            "You can not perform this transition for another branch."
        );
    }

    const permission =
        canPerformAction({
            roleCode: request.currentUser.roleCode,

            currentStatus: dailyRequest.status,

            action: request.action,
        });

    if (!permission.allowed) {
        throw new PermissionDeniedError(
            permission.reason
        );
    }

    const targetUsers = await getTargetUser(
        dailyRequest.branchId,
        request.action
    );

    if(!targetUsers || targetUsers.length === 0){
        throw new Error(
            "No target user found for the action requested."
        )
    }

    const branchCode = await branchRepository.getCodeByID(
        prisma,
        dailyRequest.branchId
    );
    console.log(branchCode);
    const assignedToId = await userRepository.findUser(
        prisma,
        {
            username: targetUsers[0].userName,
        }
    );

    //console.log(JSON.stringify(assignedToId));

    if(!assignedToId){
        throw new Error(
            "Target User not found."
        )
    }

    const updateData: Prisma.DailyRequestUpdateInput = {
        status: targetStatus,
        assignedTo: {
            connect: {
                id: assignedToId.id
            }
        }
    };

    const timeStampedUpdate =
        await applyTransitionEffects(
            updateData,
            targetStatus,
            new Date(),
        );

    return prisma.$transaction(async (tx) => {
        const updatedRequest =
            await dailyRequestRepository.update(
                tx,
                request.requestId,
                timeStampedUpdate
            );

        const history = await dailyRequestRepository.createHistory(
            tx,
            {

                dailyRequestId: request.requestId,

                userId: request.currentUser.id,

                fromStatus: dailyRequest.status,

                toStatus: targetStatus,

                action: request.action,

                note: request.note,
            },
        );
        return {
            updatedRequest,
            history,
        };
    },
        {
            timeout: 10000,
        }
    );
}


