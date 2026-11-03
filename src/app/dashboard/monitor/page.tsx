import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/features/auth/jwt";
import type { JwtPayload } from "@/features/auth/authTypes";
import { Roles } from "@/lib/constants/roles";
import RequestMonitor from "@/features/monitor/RequestMonitor";
export default async function RequestMonitorPage() {
    const token = (await cookies()).get("token")?.value;
    if (!token) redirect("/login");
    let user: JwtPayload;
    try { user = verifyToken(token); } catch { redirect("/login"); }
    if (user.roleCode !== Roles.ADMIN) redirect("/dashboard/inbox");
    return <RequestMonitor />;
}
