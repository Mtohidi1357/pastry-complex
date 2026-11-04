import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/features/auth/jwt";
import type { JwtPayload } from "@/features/auth/authTypes";
import ProductWorkspace from "@/features/catalog/ProductWorkspace";
export default async function ProductsPage() {
    const token = (await cookies()).get("token")?.value; if (!token) redirect("/login");
    let user: JwtPayload; try { user = verifyToken(token); } catch { redirect("/login"); }
    if (user.roleCode !== "ADMIN") redirect("/dashboard/inbox");
    return <ProductWorkspace />;
}
