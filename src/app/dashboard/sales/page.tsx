import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/features/auth/jwt";
import type { JwtPayload } from "@/features/auth/authTypes";
import SalesWorkspace from "@/features/sales/SalesWorkspace";
export default async function Page() {
    const token = (await cookies()).get("token")?.value;
    if (!token) redirect("/login");
    let user: JwtPayload;
    try { user = verifyToken(token); } catch { redirect("/login"); }
    if (!["INV", "BM", "ADMIN"].includes(user.roleCode)) redirect("/dashboard/inbox");
    return <SalesWorkspace />;
}
