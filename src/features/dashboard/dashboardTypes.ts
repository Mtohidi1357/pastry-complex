import { RequestStatus } from "@/generated/prisma/enums";

export interface DashboardSummary {

    draftRequests: number;

    inventorySubmitted: number;

    workshopProcessing: number;

    completedToday: number;

    cancelledRequests: number;

    averageCompletionHours: number;

}

export interface StatusDistributionItem {
    status: RequestStatus;
    count: number;
}

export interface DailyTrendItem {
    date: string;
    created: number;
    completed: number;
}