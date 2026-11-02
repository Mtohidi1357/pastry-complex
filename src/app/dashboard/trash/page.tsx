import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/features/auth/jwt";
import type { JwtPayload } from "@/features/auth/authTypes";
import { canRestoreRequests } from "@/features/dailyRequest/requestRestorePolicy";
import DeletedRequestsClient from "@/features/dailyRequest/DeletedRequestsClient";

export default async function DeletedRequestsPage() {
    const token = (await cookies()).get("token")?.value;
    if (!token) redirect("/login");
    let user: JwtPayload;
    try { user = verifyToken(token); } catch { redirect("/login"); }
    if (!canRestoreRequests(user.roleCode)) redirect("/dashboard/inbox");
    return <DeletedRequestsClient />;
}
