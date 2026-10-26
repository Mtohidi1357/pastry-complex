import { prisma } from "@/lib/prisma";
import { CurrentUser } from "../auth/authTypes";
import { requireRequestReadAccess } from "../dailyRequest/requestReadAccess";
import { DbClient } from "@/repositories/types";
import { workflowHistoryRepository } from "@/features/workflow/workflowHistoryRepository";

export async function getHistory(
    requestId: string,
    currentUser: CurrentUser,
) {
    await requireRequestReadAccess(requestId, currentUser);
    
    return workflowHistoryRepository.findByRequestId(
        prisma,
        requestId,
    );
}

export async function getRecentActivity() {
    return workflowHistoryRepository.getRecent(
        prisma
    );
}