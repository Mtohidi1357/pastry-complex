import { z } from "zod";

import { WorkflowAction } from "@/features/workflow/wrokFlowDefinition";

export const TransitionSchema = z.object({

    action: z.nativeEnum(WorkflowAction),

    note: z.string().optional(),

});

export type TransitionDto =
    z.infer<typeof TransitionSchema>;