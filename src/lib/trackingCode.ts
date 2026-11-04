export type TrackingKind = "REQ" | "RCV" | "CNT" | "USR" | "WST";
type Tracked = { id?: string; trackingNumber?: number | null };
// Padding is a minimum, not a limit: numbers above 999999 remain unique.
export function trackingCode(kind: TrackingKind, record: Tracked): string {
    const number = record.trackingNumber;
    return typeof number === "number" && Number.isInteger(number) && number > 0
        ? `${kind}-${String(number).padStart(6, "0")}` : record.id ?? "—";
}
export function parseTrackingCode(kind: TrackingKind, value: string): number | null {
    const match = new RegExp(`^${kind}-(\\d{1,10})$`, "i").exec(value.trim());
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isSafeInteger(number) && number > 0 && number <= 2_147_483_647 ? number : null;
}
export function trackedUser(user?: { username: string; trackingNumber?: number | null } | null): string {
    return user ? `${user.username}${user.trackingNumber ? ` · ${trackingCode("USR", user)}` : ""}` : "—";
}
