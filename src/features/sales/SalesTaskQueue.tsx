"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trackingCode } from "@/lib/trackingCode";
type Task = { id: string; trackingNumber: number; status: string; businessDate: string; branch: { code: string } };
export default function SalesTaskQueue({ token, role, refresh, blocked, showFinished }: { token: string; role: string; refresh: number; blocked: boolean; showFinished: boolean }) {
    const [data, setData] = useState<{ items: Task[]; totalItems: number } | null>(null), [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const c = new AbortController();
        fetch(`/api/sales?page=1&showFinished=${showFinished}${role === "BM" && !showFinished ? "&status=SUBMITTED" : ""}`, { signal: c.signal, cache: "no-store", headers: { Authorization: `Bearer ${token}` } }).then(async res => {
            const body = await res.json();
            if (res.status === 403) return null; // Workshop inventory has no sales tasks.
            if (!res.ok || !body.success) throw new Error(body.error?.message ?? "Sales tasks could not be loaded.");
            return body.data as { items: Task[]; totalItems: number };
        }).then(value => { if (!c.signal.aborted) { setData(value); setError(null); } }).catch(err => { if (!c.signal.aborted) setError(err instanceof Error ? err.message : "Sales tasks could not be loaded."); });
        return () => c.abort();
    }, [token, role, refresh, showFinished]);
    if (!data && !error) return null;
    const tasks = data?.items.filter(row => showFinished || role !== "BM" || row.status === "SUBMITTED") ?? [];
    return <section className="mb-5 rounded-2xl border border-amber-200 bg-white p-4 text-[#39291f]"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Daily sales {role === "BM" ? "awaiting confirmation" : "reports"}</h2>{!blocked && <Link href="/dashboard/sales" className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Open daily sales</Link>}</div>{error && <p role="alert" className="text-red-900">{error}</p>}<ul className="space-y-2">{tasks.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm"><span className="font-mono">{trackingCode("SLS", row)}</span><span>{row.branch.code} · {row.businessDate.slice(0, 10)}</span><span>{row.status.replaceAll("_", " ")}</span></li>)}</ul>{!tasks.length && !error && <p className="text-sm text-stone-600">No sales tasks in this preview.</p>}{data && data.totalItems > 20 && <p className="mt-3 text-sm">Showing the first page. Open daily sales for the complete list.</p>}</section>;
}
