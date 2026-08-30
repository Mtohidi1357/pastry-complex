import type { Prisma } from "@/generated/prisma/client";
import { WorkflowAction } from "./wrokFlowDefinition";
import { BusinessError } from "@/errors/BusinessError";
import { BusinessErrorCode } from "@/types/business";

type DailyRequestWithLines =
    Prisma.DailyRequestGetPayload<{
        include: { lines: true };
    }>;

interface LineCheckResult {
    allowed: boolean,
    message?: string,
}


export async function ensureTransitionPreconditions(
    dailyRequest: DailyRequestWithLines,
    action: WorkflowAction,
): Promise<LineCheckResult> {
    switch (action) {
        case WorkflowAction.SUBMIT_INVENTORY:
            if (dailyRequest.lines.length == 0) {
                throw new BusinessError(
                    BusinessErrorCode.BANNED_REQUEST_TRANSITION,
                    "Requests without lines can not be submitted."
                );
            };
            return {
                allowed: true,
                message: "Line(s) exist(s)."
            };

        case WorkflowAction.SUBMIT_MANAGER:

            for(const line of dailyRequest.lines){
                if (line.requestedQty === 0 || line.requestedQty === null) {
                    throw new BusinessError(
                        BusinessErrorCode.ZERO_QTY_PRODUCTION_NOT_ALLOWED,
                        "Requested qty for some lines are not valid."
                    )
                }
            }
                       
            return {
                allowed: true,
                message: "All requested qty are recorded."
            };
            
        case WorkflowAction.COMPLETE_PRODUCTION:
            
            for(const line of dailyRequest.lines){
                if (line.producedQty === 0 || line.producedQty === null) {
                    throw new BusinessError(
                        BusinessErrorCode.ZERO_QTY_PRODUCTION_NOT_ALLOWED,
                        "Produced qty for some lines are not valid."
                    )
                }
            }
            
            return {
                allowed: true,
                message: "All produced qty are recorded."
            };
    };

    return { 
        allowed: true,
        message: "No investigations required for this action."
    }
}
