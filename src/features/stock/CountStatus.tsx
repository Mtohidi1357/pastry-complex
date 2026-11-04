const colors: Record<string, string> = {
    DRAFT: "border-amber-200 bg-amber-50 text-amber-900",
    SUBMITTED: "border-sky-200 bg-sky-50 text-sky-900",
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-900",
};
export default function CountStatus({ status }: { status: string }) {
    return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${colors[status] ?? "border-stone-200 bg-stone-100 text-stone-700"}`}>{status.replaceAll("_", " ")}</span>;
}
