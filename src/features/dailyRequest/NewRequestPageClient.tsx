"use client";

import { useRouter } from "next/navigation";
import CreateNewRequestForm from "./DailyRequestForm";

export default function NewRequestPageClient({ initialBusinessDate }: { initialBusinessDate: Date }) {
    const router = useRouter();
    const close = () => router.push("/dashboard/inbox");
    return (
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-4">
            <CreateNewRequestForm initBusinessDate={initialBusinessDate} initBranchId=""
                onClose={close} onSubmitted={close} />
        </main>
    );
}
