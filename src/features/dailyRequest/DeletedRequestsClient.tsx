"use client";
import { trackingCode, trackedUser } from "@/lib/trackingCode";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { useStoredValue } from "@/hooks/useStoredValue";

type DeletedItem = {
    id: string; trackingNumber?: number;
    businessDate: string;
    status: string;
    deletedAt: string;
    branch: { name: string } | null;
    assignedTo: { username: string; trackingNumber?: number } | null;
    deletedBy: { username: string; trackingNumber?: number } | null;
};
type Result = { items: DeletedItem[]; totalItems: number; page: number; pageSize: number };

async function fetchDeleted(token: string, page: number, signal?: AbortSignal): Promise<Result> {
    const response = await fetch(`/api/daily-requests/deleted?page=${page}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Failed to load deleted requests.");
    return body.data;
}

export default function DeletedRequestsClient() {
    const token = useStoredValue("token") ?? "";
    if (!token) return <p>Please <Link href="/login" className="underline">sign in</Link> to view deleted requests.</p>;
    return <DeletedRequestsView key={token} token={token} />;
}

function DeletedRequestsView({ token }: { token: string }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [data, setData] = useState<Result | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [selected, setSelected] = useState<DeletedItem | null>(null);
    const [restoring, setRestoring] = useState(false);
    const busy = useRef(false);
    const generation = useRef(0);

    useEffect(() => {
        if (!token) return;
        const controller = new AbortController();
        const current = ++generation.current;
        fetchDeleted(token, page, controller.signal)
            .then(result => {
                if (!controller.signal.aborted && current === generation.current) {
                    setData(result); setError(null);
                }
            })
            .catch((err: unknown) => {
                if (!controller.signal.aborted && current === generation.current) {
                    setData(null);
                    setError(err instanceof Error ? err.message : "Failed to load deleted requests.");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted && current === generation.current) setLoading(false);
            });
        return () => controller.abort();
    }, [token, page]);

    async function refresh() {
        if (!token) return;
        const current = ++generation.current;
        setLoading(true);
        setError(null);
        try {
            const result = await fetchDeleted(token, page);
            if (current === generation.current) setData(result);
        } catch (err) {
            if (current === generation.current) {
                setData(null);
                setError(err instanceof Error ? err.message : "Failed to load deleted requests.");
            }
        } finally {
            if (current === generation.current) setLoading(false);
        }
    }

    async function restoreSelected() {
        if (!selected || !token || busy.current) return;
        busy.current = true;
        setRestoring(true);
        setError(null);
        setMessage(null);
        try {
            const response = await fetch(`/api/daily-requests/${selected.id}/restore`, {
                method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Restore failed.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Restore failed.");
            busy.current = false;
            setRestoring(false);
            return;
        }
        setSelected(null);
        setMessage("Request restored. Its workflow status and assignment were preserved. Open the assigned user's inbox to continue active work.");
        await refresh();
        busy.current = false;
        setRestoring(false);
    }

    function changePage(next: number) {
        setSelected(null); setMessage(null); setLoading(true); setPage(next);
    }

    return (
        <div className="min-h-screen bg-slate-100 text-gray-900">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <main className="mx-auto max-w-6xl p-4 lg:pl-24">
                <header className="flex flex-wrap items-center gap-4 py-4">
                    <button type="button" onClick={() => setSidebarOpen(true)} className="rounded border bg-white px-3 py-2 lg:hidden">Menu</button>
                    <h1 className="text-2xl font-semibold">Deleted requests</h1>
                    <Link href="/dashboard/inbox" className="text-blue-700 underline">Back to inbox</Link>
                    <button type="button" disabled={loading || restoring || !token} onClick={() => { void refresh(); }}
                        className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">Refresh</button>
                </header>
                <p className="mb-4 text-sm text-gray-700">Restore soft-deleted requests without changing their workflow stage or assignment. A request cannot be restored when another active request exists for its branch and business date. Cancellation remains unchanged.</p>
                {!token && <p role="alert">Please sign in to view deleted requests.</p>}
                {message && <p role="status" className="mb-4 rounded bg-green-100 p-3 text-green-900">{message}</p>}
                {error && <p role="alert" className="mb-4 rounded bg-red-100 p-3 text-red-800">{error}</p>}
                {selected && (
                    <section className="mb-4 rounded-xl border border-blue-300 bg-white p-4" aria-label="Confirm restoration">
                        <h2 className="font-semibold">Restore request {trackingCode("REQ", selected)}?</h2>
                        <p className="mt-2 text-sm">Status: {selected.status}. Assigned to: {selected.assignedTo ? trackedUser(selected.assignedTo) : "Unassigned"}. Quantities and history will be retained.</p>
                        <div className="mt-3 flex gap-3">
                            <button type="button" disabled={restoring} onClick={() => { void restoreSelected(); }}
                                className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{restoring ? "Restoring…" : "Confirm restore"}</button>
                            <button type="button" disabled={restoring} onClick={() => setSelected(null)} className="rounded border px-4 py-2">Keep deleted</button>
                        </div>
                    </section>
                )}
                {token && loading && <p role="status">Loading deleted requests…</p>}
                {token && !loading && data && (
                    <>
                        <div className="overflow-x-auto rounded-xl border bg-white">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-200"><tr>
                                    <th className="p-3">Request</th><th className="p-3">Business date</th><th className="p-3">Branch</th>
                                    <th className="p-3">Status</th><th className="p-3">Deleted</th><th className="p-3">Deleted by</th><th className="p-3">Action</th>
                                </tr></thead>
                                <tbody>{data.items.map(item => (
                                    <tr key={item.id} className="border-t">
                                        <td className="p-3 font-mono text-xs">{trackingCode("REQ", item)}</td><td className="p-3">{item.businessDate.slice(0, 10)}</td>
                                        <td className="p-3">{item.branch?.name ?? "—"}</td><td className="p-3">{item.status}</td>
                                        <td className="p-3">{new Date(item.deletedAt).toLocaleString()}</td><td className="p-3">{trackedUser(item.deletedBy)}</td>
                                        <td className="p-3"><button type="button" disabled={restoring} onClick={() => { setSelected(item); setError(null); setMessage(null); }}
                                            className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">Restore</button></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                            {data.items.length === 0 && <p className="p-4">No deleted requests on this page.</p>}
                        </div>
                        <div className="mt-4 flex items-center gap-4">
                            <button type="button" disabled={page <= 1 || restoring} onClick={() => changePage(page - 1)} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Previous</button>
                            <span>Page {page} · {data.totalItems} deleted requests</span>
                            <button type="button" disabled={page * data.pageSize >= data.totalItems || restoring} onClick={() => changePage(page + 1)} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Next</button>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
