import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/features/auth/jwt";
import type { JwtPayload } from "@/features/auth/authTypes";
import { canViewCounts } from "@/features/stock/countPolicy";
import CountWorkspace from "@/features/stock/CountWorkspace";
export default async function StockCountsPage() {
    const token = (await cookies()).get("token")?.value;
    if (!token) redirect("/login");
    let user: JwtPayload;
    try { user = verifyToken(token); } catch { redirect("/login"); }
    if (!canViewCounts(user.roleCode)) redirect("/dashboard/inbox");
    return <CountWorkspace />;
}
