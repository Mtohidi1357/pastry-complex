import { parseShowFinished } from "@/lib/listVisibility";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";
import { RequestStatus, type Prisma } from "@/generated/prisma/client";

const fields = ["page", "branchId", "assignedToId", "status", "records", "from", "to", "showFinished"];
export function monitorFilters(params: URLSearchParams) {
    const invalid = () => new AppError(ApiErrorCode.VALIDATION_ERROR, "Invalid monitoring filters.", 400);
    for (const key of params.keys()) if (!fields.includes(key) || params.getAll(key).length !== 1) throw invalid();
    const pageText = params.get("page") ?? "1";
    if (!/^\d+$/.test(pageText)) throw invalid();
    const page = Number(pageText);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) throw invalid();
    const where: Prisma.DailyRequestWhereInput = parseShowFinished(params.get("showFinished")) ? {} : {
        AND: [{ status: { notIn: [RequestStatus.CLOSED, RequestStatus.CANCELLED] } }, { deletedAt: null }],
    };
    for (const key of ["branchId", "assignedToId"] as const) {
        const value = params.get(key);
        if (value) {
            if (key === "assignedToId" && value === "unassigned") where.assignedToId = null;
            else {
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw invalid();
                where[key] = value;
            }
        }
    }
    const status = params.get("status");
    if (status) {
        if (!Object.values(RequestStatus).includes(status as RequestStatus)) throw invalid();
        where.status = status as RequestStatus;
    }
    const records = params.get("records") || "all";
    if (!["all", "active", "deleted"].includes(records)) throw invalid();
    if (records === "active") where.deletedAt = null;
    if (records === "deleted") where.deletedAt = { not: null };
    function date(value: string | null): Date | undefined {
        if (!value) return undefined;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid();
        const result = new Date(value + "T00:00:00.000Z");
        if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw invalid();
        return result;
    }
    const from = date(params.get("from")), to = date(params.get("to"));
    if (from && to && from > to) throw invalid();
    if (from || to) where.businessDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}),
    };
    return { where, page, pageSize: 20 };
}
