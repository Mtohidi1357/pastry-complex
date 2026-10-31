import { getRequestReadScope } from "../dailyRequest/requestReadScope";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "../auth/authTypes";
import { requireRequestReadAccess } from "../dailyRequest/requestReadAccess";
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

export async function getRecentActivity(currentUser: CurrentUser) {
    return workflowHistoryRepository.getRecent(
        prisma,
        getRequestReadScope(currentUser),
    );
}

