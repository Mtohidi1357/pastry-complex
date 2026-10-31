import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/features/auth/jwt";
import { canCreateRequests } from "@/features/dailyRequest/requestCreationPolicy";
import NewRequestPageClient from "@/features/dailyRequest/NewRequestPageClient";
import type { JwtPayload } from "@/features/auth/authTypes";

export default async function NewDailyRequestPage() {
    const token = (await cookies()).get("token")?.value;
    if (!token) redirect("/login");
    let user: JwtPayload;
    try {
        user = verifyToken(token);
    } catch {
        redirect("/login");
    }
    if (!canCreateRequests(user.roleCode)) redirect("/dashboard/inbox");
    return <NewRequestPageClient initialBusinessDate={new Date()} />;
}
