import { RequestStatus } from "@/generated/prisma/enums";
import { RoleCode, Roles } from "@/lib/constants/roles";

export enum WorkflowAction {
    CREATE_REQUEST = "CREATE_REQUEST",
    SUBMIT_INVENTORY = "SUBMIT_INVENTORY",
    SUBMIT_MANAGER = "SUBMIT_MANAGER",
    START_PRODUCTION = "START_PRODUCTION",
    COMPLETE_PRODUCTION = "COMPLETE_PRODUCTION",
    CLOSE_REQUEST = "CLOSE_REQUEST",
    CANCEL_REQUEST = "CANCEL_REQUEST",
    EDIT_REQUEST = "EDIT_REQUEST",
    DELETE_REQUEST = "DELETE_REQUEST",
    RESTORE_REQUEST = "RESTORE_REQUEST",
}

export interface WorkflowStateDefinition {
    transitions: Partial<
        Record<
            WorkflowAction,
            WorkflowTransitionDefinition
        >
    >;
}

export interface WorkflowTransitionDefinition {
    roles: RoleCode[];
}

export const WorkflowDefinition: Partial<Record<
    RequestStatus,
    WorkflowStateDefinition
>> = {
    [RequestStatus.DRAFT]: {
        transitions: {
            [WorkflowAction.SUBMIT_INVENTORY]: {
                roles: [Roles.INV],
            },
            [WorkflowAction.CANCEL_REQUEST]: {
                roles: [Roles.INV],
            },
            [WorkflowAction.EDIT_REQUEST]: {
                roles: [Roles.INV],
            },
        },
    },

    [RequestStatus.INVENTORY_SUBMITTED]: {
        transitions: {
            [WorkflowAction.SUBMIT_MANAGER]: {
                roles: [Roles.BM]
            },
            [WorkflowAction.CANCEL_REQUEST]: {
                roles: [Roles.BM]
            },
        },
    },

    [RequestStatus.MANAGER_SUBMITTED]: {
        transitions: {
            [WorkflowAction.START_PRODUCTION]: {
                roles: [Roles.WM]
            },
            [WorkflowAction.CANCEL_REQUEST]: {
                roles: [Roles.WM]
            },
        },
    },

    [RequestStatus.WORKSHOP_PROCESSING]: {
        transitions: {
            [WorkflowAction.CANCEL_REQUEST]: {
                roles: [Roles.WM]
            },
            [WorkflowAction.COMPLETE_PRODUCTION]: {
                roles: [Roles.WM]
            },
        }
    },

    [RequestStatus.COMPLETED]: {
        transitions: {
            [WorkflowAction.CLOSE_REQUEST]: {
                roles: [Roles.BM],
            }
        }
    },
} as const;

export interface TargetUserName {
    userName: string,    
};

export interface WorkflowTargetUserDefinition {
    targetUsers: Partial<
        Record<
            string,
            TargetUserName[]
        >>
}

export const WorkflowDelegations: Partial<Record<
    WorkflowAction,
    WorkflowTargetUserDefinition
>> = {
    [WorkflowAction.SUBMIT_INVENTORY]: {
        targetUsers: {
            ["BR01"]: [
                {
                    userName: "manager",
                },
            ],
            ["BR02"]: [
                {
                    userName: "manager2",
                },
            ]
        }
    },
    [WorkflowAction.SUBMIT_MANAGER]: {
        targetUsers: {
            ["BR01"]: [
                {
                    userName: "workshop",
                }
            ],
            ["BR02"]: [
                {
                    userName: "workshop",
                }
            ]
        }
    },
    [WorkflowAction.START_PRODUCTION]: {
        targetUsers: {
            ["BR01"]: [
                {
                    userName: "workshop",
                }
            ],
            ["BR02"]: [
                {
                    userName: "workshop",
                }
            ]
        }
    },
    [WorkflowAction.COMPLETE_PRODUCTION]: {
        targetUsers: {
            ["BR01"]: [
                {
                    userName: "manager",
                }
            ],
            ["BR02"]: [
                {
                    userName: "manager2",
                }
            ]
        }
    },
    [WorkflowAction.CLOSE_REQUEST]: {
        targetUsers: {
            ["BR01"]: [
                {
                    userName: "manager",
                }
            ],
            ["BR02"]: [
                {
                    userName: "manager2",
                }
            ]
        }
    },
} as const;
