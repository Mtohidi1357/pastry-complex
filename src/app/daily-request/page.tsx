import CreateNewRequestForm from "@/features/dailyRequest/DailyRequestForm";

export default function NewDailyRequestPage(
  businessDate: Date,
  branchId: string
) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
      <CreateNewRequestForm
          businessDate={new Date()}
          branchId="" />
    </main>
  );
}