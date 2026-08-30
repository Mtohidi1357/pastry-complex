import { RequestStatus } from "../../generated/prisma/enums";
import { } from "@/generated/prisma/models";
import { WorkflowAction, WorkflowDelegations } from "./wrokFlowDefinition";
import { branchRepository } from "../branches/branchRepo";
import { prisma } from "@/lib/prisma";

export const WorkflowTransitions: Record<
    RequestStatus,
    RequestStatus[]
> = {
    [RequestStatus.DRAFT]: [
        RequestStatus.INVENTORY_SUBMITTED,
        RequestStatus.CANCELLED,
        //RequestStatus.DELETED,
    ],

    [RequestStatus.INVENTORY_SUBMITTED]: [
        RequestStatus.MANAGER_SUBMITTED,
        RequestStatus.CANCELLED,
        //RequestStatus.DELETED,
    ],

    [RequestStatus.MANAGER_SUBMITTED]: [
        RequestStatus.WORKSHOP_PROCESSING,
    ],

    [RequestStatus.WORKSHOP_PROCESSING]: [
        RequestStatus.COMPLETED,
    ],

    [RequestStatus.COMPLETED]: [
        RequestStatus.CLOSED,
    ],

    [RequestStatus.CLOSED]: [],

    [RequestStatus.CANCELLED]: [],

    //[RequestStatus.DELETED]: [],
} as const;

export const transitionActions = [
    WorkflowAction.SUBMIT_INVENTORY,
    WorkflowAction.SUBMIT_MANAGER,
    WorkflowAction.START_PRODUCTION,
    WorkflowAction.COMPLETE_PRODUCTION,
    WorkflowAction.CLOSE_REQUEST,
    WorkflowAction.CANCEL_REQUEST,
] as const;

export const ActionTargetStatus: Partial<Record<
    WorkflowAction,
    RequestStatus
>> = {
    [WorkflowAction.CREATE_REQUEST]:
        RequestStatus.DRAFT,

    [WorkflowAction.SUBMIT_INVENTORY]:
        RequestStatus.INVENTORY_SUBMITTED,

    [WorkflowAction.SUBMIT_MANAGER]:
        RequestStatus.MANAGER_SUBMITTED,

    [WorkflowAction.START_PRODUCTION]:
        RequestStatus.WORKSHOP_PROCESSING,

    [WorkflowAction.COMPLETE_PRODUCTION]:
        RequestStatus.COMPLETED,

    [WorkflowAction.CLOSE_REQUEST]:
        RequestStatus.CLOSED,

    [WorkflowAction.CANCEL_REQUEST]:
        RequestStatus.CANCELLED,

};

export function validTransition(
    from: RequestStatus,
    to: RequestStatus
): boolean {
    return WorkflowTransitions[from].includes(to);
}

export function getTargetStatus(
    action: WorkflowAction
): RequestStatus | undefined {
    return ActionTargetStatus[action];
}

export async function getTargetUser(
    branchId: string,
    action: WorkflowAction
){  
    const branchCode = await branchRepository.getCodeByID(
        prisma,
        branchId
    )

    if(!branchCode){
        throw new Error(
            "Branch not identified."
        )
    }

    return WorkflowDelegations[action]?.targetUsers[branchCode];
}