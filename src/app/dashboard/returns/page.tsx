import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/features/auth/jwt";
import type { JwtPayload } from "@/features/auth/authTypes";
import ReturnWorkspace from "@/features/returns/ReturnWorkspace";
export default async function Page() {
    const token = (await cookies()).get("token")?.value;
    if (!token) redirect("/login");
    let user: JwtPayload;
    try { user = verifyToken(token); } catch { redirect("/login"); }
    if (!["INV", "BM", "WM", "ADMIN"].includes(user.roleCode)) redirect("/dashboard/inbox");
    return <ReturnWorkspace />;
}
