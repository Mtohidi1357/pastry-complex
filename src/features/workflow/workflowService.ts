import { prisma } from "@/lib/prisma";
import { DbClient } from "@/repositories/types";
import { workflowHistoryRepository } from "@/features/workflow/workflowHistoryRepository";

export async function getHistory(
    requestId: string,
) {
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