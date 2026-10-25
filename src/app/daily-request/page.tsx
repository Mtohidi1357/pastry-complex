"use client";
import { useRouter } from "next/navigation";
import CreateNewRequestForm from "@/features/dailyRequest/DailyRequestForm";

export default function NewDailyRequestPage(
  // businessDate: Date,
  // branchId: string
) {
  const router = useRouter();
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
      <CreateNewRequestForm
          initBusinessDate={new Date()}
          initBranchId=""
          onClose={() => router.push("/dashboard/inbox")} 
          onSubmitted={() => {}}/>
    </main>
  );
}