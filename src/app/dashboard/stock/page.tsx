import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/features/auth/jwt";
import type { JwtPayload } from "@/features/auth/authTypes";
import { canViewStock } from "@/features/stock/stockPolicy";
import StockWorkspace from "@/features/stock/StockWorkspace";
export default async function StockPage() {
    const token = (await cookies()).get("token")?.value;
    if (!token) redirect("/login");
    let user: JwtPayload;
    try { user = verifyToken(token); } catch { redirect("/login"); }
    if (!canViewStock(user.roleCode)) redirect("/dashboard/inbox");
    return <StockWorkspace />;
}
