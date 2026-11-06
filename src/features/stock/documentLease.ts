import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "../auth/authTypes";
import { AppError } from "@/errors/AppError";
import { ApiErrorCode } from "@/types/api";

type Tx = Prisma.TransactionClient;
export function leaseConflict(message: string): never {
    throw new AppError(ApiErrorCode.EDIT_LEASE_CONFLICT, message, 409);
}
async function databaseNow(tx: Tx) {
    const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT CURRENT_TIMESTAMP(3) AS now`;
    return row.now;
}
// Caller must authorize the actor and lock the document row before using these functions.
export async function requireDocumentLease(tx: Tx, key: string, user: CurrentUser, token?: string) {
    const lease = await tx.stockDocumentLease.findUnique({ where: { key } });
    const now = await databaseNow(tx);
    if (!token || !lease || lease.ownerId !== user.id || lease.token !== token || lease.expiresAt <= now) {
        leaseConflict("Your editing session expired or was closed. Your changes were not saved. Close this editor and open it again.");
    }
}
export async function changeDocumentLease(tx: Tx, key: string, user: CurrentUser, token: string, action: "acquire" | "renew" | "release") {
    const lease = await tx.stockDocumentLease.findUnique({ where: { key } });
    const now = await databaseNow(tx);
    const owned = lease?.ownerId === user.id && lease.token === token;
    if (action === "release") {
        if (owned) await tx.stockDocumentLease.deleteMany({ where: { key, ownerId: user.id, token } });
        return { released: true };
    }
    if (action === "renew" && (!owned || !lease || lease.expiresAt <= now)) {
        leaseConflict("Your editing session expired. Close this editor and open it again; your changes have not been saved.");
    }
    if (lease && lease.expiresAt > now && !owned) {
        leaseConflict("This record is already being edited in another tab or device. Close that editor before continuing, or wait for its session to expire.");
    }
    const expiresAt = new Date(now.getTime() + 90_000);
    await tx.stockDocumentLease.upsert({ where: { key }, create: { key, ownerId: user.id, token, expiresAt }, update: { ownerId: user.id, token, expiresAt } });
    return { expiresAt, ttlSeconds: 90 };
}
