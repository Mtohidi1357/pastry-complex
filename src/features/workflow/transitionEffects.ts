import { RequestStatus } from "../../generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export async function applyTransitionEffects(
    updateData: Prisma.DailyRequestUpdateInput,
    status: RequestStatus,
    now: Date
): Promise<Prisma.DailyRequestUpdateInput> {
    switch (status) {
        case RequestStatus.INVENTORY_SUBMITTED:
            return {
                ...updateData,
                submittedAt: now,
            }

        case RequestStatus.MANAGER_SUBMITTED:
            return {
                ...updateData,
                approvedAt: now,
            }

        case RequestStatus.COMPLETED:
            return {
                ...updateData,
                completedAt: now,
            }

        case RequestStatus.CLOSED:
            return {
                ...updateData,
                reportedAt: now,
            }

        //case RequestStatus.CANCELLED:
    }

    return updateData;
}