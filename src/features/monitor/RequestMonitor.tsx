"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { useStoredValue } from "@/hooks/useStoredValue";

type Identity = { id: string; username: string };
type Summary = {
    id: string; businessDate: string; status: string; branchId: string; assignedToId: string | null;
    createdAt: string; updatedAt: string; submittedAt: string | null; approvedAt: string | null;
    completedAt: string | null; reportedAt: string | null; cancelledAt: string | null;
    deletedAt: string | null; lastActionAt: string | null;
    branch: { id: string; code: string; name: string } | null;
    createdBy: Identity; assignedTo: Identity | null; deletedBy: Identity | null;
};
type Detail = Summary & {
    lines: { id: string; previousBalance: number; currentBalance: number; requestedQty: number | null;
        producedQty: number | null; receivedQty: number | null; reportTime: string | null;
        managerNote: string | null; workshopNote: string | null; product: { code: string; displayName: string } }[];
    history: { id: string; action: string; changedAt: string; fromStatus: string | null; toStatus: string;
        note: string | null; user: Identity }[];
};
type Listing = { items: Summary[]; totalItems: number; page: number; pageSize: number };
type Options = { branches: { id: string; code: string; name: string; isActive: boolean }[];
    users: (Identity & { isActive: boolean })[] };
const statuses = ["DRAFT", "INVENTORY_SUBMITTED", "MANAGER_SUBMITTED", "WORKSHOP_PROCESSING", "COMPLETED", "CLOSED", "CANCELLED"];
const field = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";
const button = "rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50";
async function read<T>(url: string, token: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Failed to load monitoring data.");
    return body.data;
}
function time(value: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

export default function RequestMonitor() {
    const token = useStoredValue("token") ?? "";
    if (!token) return <p>Please <Link href="/login" className="underline">sign in</Link> to monitor requests.</p>;
    return <MonitorView key={token} token={token} />;
}
function MonitorView({ token }: { token: string }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [options, setOptions] = useState<Options>({ branches: [], users: [] });
    const [optionError, setOptionError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [refresh, setRefresh] = useState(0);
    const [listing, setListing] = useState<Listing | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        read<Options>("/api/admin/requests/options", token, controller.signal)
            .then(value => { if (!controller.signal.aborted) { setOptions(value); setOptionError(null); } })
            .catch((err: unknown) => { if (!controller.signal.aborted) setOptionError(err instanceof Error ? err.message : "Filters could not be loaded."); });
        return () => controller.abort();
    }, [token, refresh]);
    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams(query); params.set("page", String(page));
        read<Listing>(`/api/admin/requests?${params}`, token, controller.signal)
            .then(value => { if (!controller.signal.aborted) { setListing(value); setError(null); } })
            .catch((err: unknown) => {
                if (!controller.signal.aborted) { setListing(null); setError(err instanceof Error ? err.message : "Requests could not be loaded."); }
            })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [token, query, page, refresh]);
    useEffect(() => {
        if (!selected) return;
        const controller = new AbortController();
        read<Detail>(`/api/admin/requests/${selected}`, token, controller.signal)
            .then(value => { if (!controller.signal.aborted) { setDetail(value); setDetailError(null); } })
            .catch((err: unknown) => {
                if (!controller.signal.aborted) { setDetail(null); setDetailError(err instanceof Error ? err.message : "Details could not be loaded."); }
            })
            .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
        return () => controller.abort();
    }, [token, selected, refresh]);

    function apply(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget), params = new URLSearchParams();
        for (const [key, value] of form.entries()) if (typeof value === "string" && value) params.set(key, value);
        setQuery(params.toString()); setPage(1); setSelected(null); setError(null); setLoading(true); setRefresh(value => value + 1);
    }
    function reload() {
        setLoading(true); setError(null); setOptionError(null);
        if (selected) { setDetailLoading(true); setDetailError(null); }
        setRefresh(value => value + 1);
    }
    function turnPage(value: number) { setSelected(null); setLoading(true); setError(null); setPage(value); }

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <main className="mx-auto max-w-7xl p-4 lg:pl-24">
                <header className="mb-5 flex flex-wrap items-center justify-between gap-3 py-3">
                    <div><button type="button" onClick={() => setSidebarOpen(true)} className="mb-2 rounded border bg-white px-3 py-2 lg:hidden">Menu</button>
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Administration · Read only</p>
                        <h1 className="mt-1 text-2xl font-semibold">Request Monitor</h1>
                        <p className="mt-1 text-sm text-slate-600">All branches, every workflow stage, including cancelled and deleted requests.</p></div>
                    <div className="flex items-center gap-4"><Link href="/dashboard/trash" className="text-sm text-blue-700 underline">Recover deleted requests</Link>
                        <button type="button" disabled={loading} onClick={reload} className={button}>Refresh</button></div>
                </header>
                <form onSubmit={apply} className="mb-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-sm font-medium">Branch<select name="branchId" className={field} defaultValue=""><option value="">All branches</option>
                        {options.branches.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}{item.isActive ? "" : " (inactive)"}</option>)}</select></label>
                    <label className="text-sm font-medium">Status<select name="status" defaultValue="" className={field}><option value="">All stages</option>
                        {statuses.map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
                    <label className="text-sm font-medium">Assigned to<select name="assignedToId" defaultValue="" className={field}><option value="">Everyone</option><option value="unassigned">Unassigned</option>
                        {options.users.map(item => <option key={item.id} value={item.id}>{item.username}{item.isActive ? "" : " (inactive)"}</option>)}</select></label>
                    <label className="text-sm font-medium">Records<select name="records" defaultValue="all" className={field}><option value="all">Active and deleted</option><option value="active">Not deleted</option><option value="deleted">Deleted only</option></select></label>
                    <label className="text-sm font-medium">Business date from<input type="date" name="from" className={field} /></label>
                    <label className="text-sm font-medium">Business date to<input type="date" name="to" className={field} /></label>
                    <div className="flex items-end gap-3 sm:col-span-2"><button type="submit" className={button} disabled={loading}>Apply filters</button>
                        <button type="reset" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => { setQuery(""); setPage(1); setSelected(null); setLoading(true); setRefresh(value => value + 1); }}>Reset</button>
                        <span className="pb-2 text-xs text-slate-500">Business dates use UTC calendar days.</span></div>
                </form>
                {optionError && <p role="alert" className="mb-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">{optionError} Use Refresh to retry loading filter choices.</p>}
                {error && <p role="alert" className="mb-4 rounded-lg bg-red-100 p-3 text-red-800">{error}</p>}
                {loading && <p role="status" className="mb-4 text-sm text-slate-600">Loading requests…</p>}
                {!loading && listing && <>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <table className="w-full text-left text-sm"><thead className="bg-slate-200"><tr>
                            {["Request", "Business date", "Branch", "Status", "Assigned to", "Record", ""].map((label, index) => <th key={index} className="px-4 py-3">{label}</th>)}</tr></thead>
                            <tbody>{listing.items.map(item => <tr key={item.id} className={`border-t ${selected === item.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                                <td className="max-w-52 break-all px-4 py-3 font-mono text-xs">{item.id}</td><td className="whitespace-nowrap px-4 py-3">{item.businessDate.slice(0, 10)}</td>
                                <td className="px-4 py-3">{item.branch?.code ?? "—"}</td><td className="px-4 py-3 text-xs font-medium">{item.status.replaceAll("_", " ")}</td>
                                <td className="px-4 py-3">{item.assignedTo?.username ?? "Unassigned"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${item.deletedAt ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>{item.deletedAt ? "Deleted" : "Not deleted"}</span></td>
                                <td className="px-4 py-3"><button type="button" className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-2 text-blue-800 hover:bg-blue-50" aria-expanded={selected === item.id}
                                    onClick={() => { if (selected === item.id) return; setSelected(item.id); setDetail(null); setDetailLoading(true); setDetailError(null); }}>View details</button></td>
                            </tr>)}</tbody></table>
                        {listing.items.length === 0 && <p className="p-6 text-sm text-slate-600">No requests match these filters.</p>}
                    </div>
                    <nav aria-label="Request pages" className="my-4 flex items-center justify-between gap-3 text-sm">
                        <span>{listing.totalItems} requests · Page {page}</span><div className="flex gap-2">
                            <button type="button" disabled={page <= 1} onClick={() => turnPage(page - 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Previous</button>
                            <button type="button" disabled={page * listing.pageSize >= listing.totalItems} onClick={() => turnPage(page + 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Next</button></div>
                    </nav>
                </>}
                {selected && <section aria-label="Request details" className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Request details</h2><p className="mt-1 break-all font-mono text-xs text-slate-500">{selected}</p></div>
                        <button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-3 py-2 text-sm">Close details</button></div>
                    {detailLoading && <p role="status" className="mt-4">Loading details…</p>}
                    {detailError && <p role="alert" className="mt-4 rounded bg-red-100 p-3 text-red-800">{detailError}</p>}
                    {!detailLoading && detail?.id === selected && <DetailView request={detail} />}
                </section>}
            </main>
        </div>
    );
}
function DetailView({ request }: { request: Detail }) {
    const facts: [string, string][] = [
        ["Business date", request.businessDate.slice(0, 10)], ["Branch", request.branch ? `${request.branch.code} · ${request.branch.name}` : "—"],
        ["Status", request.status.replaceAll("_", " ")], ["Assigned to", request.assignedTo?.username ?? "Unassigned"],
        ["Created by", request.createdBy.username], ["Created", time(request.createdAt)], ["Updated", time(request.updatedAt)],
        ["Inventory submitted", time(request.submittedAt)], ["Manager approved", time(request.approvedAt)],
        ["Production completed", time(request.completedAt)], ["Reported / closed", time(request.reportedAt)],
        ["Last action", time(request.lastActionAt)], ["Cancelled", time(request.cancelledAt)],
        ["Deleted", time(request.deletedAt)], ["Deleted by", request.deletedBy?.username ?? "—"],
    ];
    return <>
        <dl className="my-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {facts.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
        </dl>
        <h3 className="mb-3 font-semibold">Product quantities <span className="text-sm font-normal text-slate-500">({request.lines.length})</span></h3>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-100"><tr>
            {["Product", "Previous", "Current", "Requested", "Produced", "Received", "Report time", "Notes"].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>{request.lines.map(line => <tr key={line.id} className="border-t align-top">
                <td className="px-3 py-3 font-medium">{line.product.displayName}<span className="mt-1 block text-xs text-slate-500">{line.product.code}</span></td>
                {[line.previousBalance, line.currentBalance, line.requestedQty, line.producedQty, line.receivedQty].map((value, index) => <td key={index} className="px-3 py-3 tabular-nums">{value ?? "—"}</td>)}
                <td className="px-3 py-3 text-xs">{time(line.reportTime)}</td><td className="min-w-40 whitespace-pre-wrap px-3 py-3 text-xs">
                    {line.managerNote && <p><strong>Manager:</strong> {line.managerNote}</p>}{line.workshopNote && <p className="mt-1"><strong>Workshop:</strong> {line.workshopNote}</p>}{!line.managerNote && !line.workshopNote && "—"}</td>
            </tr>)}</tbody></table>{request.lines.length === 0 && <p className="p-4 text-sm text-slate-500">No product rows.</p>}</div>
        <h3 className="mb-3 mt-6 font-semibold">Workflow history</h3>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-100"><tr>
            {["Time", "User", "Action", "From", "To", "Note"].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>{request.history.map(event => <tr key={event.id} className="border-t align-top"><td className="px-3 py-3 text-xs">{time(event.changedAt)}</td><td className="px-3 py-3">{event.user.username}</td>
                <td className="px-3 py-3 text-xs font-medium">{event.action}</td><td className="px-3 py-3 text-xs">{event.fromStatus ?? "—"}</td><td className="px-3 py-3 text-xs">{event.toStatus}</td><td className="whitespace-pre-wrap px-3 py-3">{event.note ?? "—"}</td></tr>)}</tbody>
        </table>{request.history.length === 0 && <p className="p-4 text-sm text-slate-500">No workflow events recorded.</p>}</div>
        <p className="mt-4 text-xs text-slate-500">Monitoring only. Restoring a soft-deleted request remains available in Trash.</p>
    </>;
}
