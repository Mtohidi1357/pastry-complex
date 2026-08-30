import { WorkflowAction } from "../workflow/wrokFlowDefinition";

export interface RequestCapabilities {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canRestore: boolean;
    availableActions: WorkflowAction[];
}
