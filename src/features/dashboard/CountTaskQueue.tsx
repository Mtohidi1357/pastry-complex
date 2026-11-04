"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { trackingCode, trackedUser } from "@/lib/trackingCode";
import { CountPanel, type Count, type Actor } from "../stock/CountWorkspace";
import CountStatus from "../stock/CountStatus";

type Task = { id: string; trackingNumber: number; kind: string; status: string; businessDate: string; createdAt: string;
    createdBy: { username: string; trackingNumber?: number }; branch: { code: string } };
type Listing = { items: Task[]; totalItems: number; pageSize: number };
const button = "min-h-10 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 hover:bg-stone-50 disabled:opacity-50";
async function read<T>(url: string, token: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Count tasks could not be loaded.");
    return body.data;
}
type Props = { token: string; showFinished: boolean; refresh: number; blocked: boolean; onEditorChange: (open: boolean) => void };
export default function CountTaskQueue(props: Props) {
    let actor: Actor | null = null;
    try { actor = jwtDecode<Actor>(props.token); } catch { /* The API verifies authentication. */ }
    if (!actor || actor.roleCode !== "BM") return null;
    return <CountTasks key={`${props.token}:${props.showFinished}`} {...props} actor={actor} />;
}
function CountTasks({ token, showFinished, refresh, blocked, onEditorChange, actor }: Props & { actor: Actor }) {
    const [listing, setListing] = useState<Listing | null>(null), [page, setPage] = useState(1), [reload, setReload] = useState(0);
    const [loading, setLoading] = useState(true), [opening, setOpening] = useState(false), [selected, setSelected] = useState<Count | null>(null);
    const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null), generation = useRef(0);
    useEffect(() => {
        const controller = new AbortController(); let relocated = false;
        const query = new URLSearchParams({ page: String(page), showFinished: String(showFinished) });
        read<Listing>(`/api/dashboard/count-tasks?${query}`, token, controller.signal).then(value => {
            if (controller.signal.aborted) return;
            const last = Math.max(1, Math.ceil(value.totalItems / value.pageSize));
            if (page > last) { relocated = true; setPage(last); return; }
            setListing(value); setError(null);
        }).catch((err: unknown) => { if (!controller.signal.aborted) { setListing(null); setError(err instanceof Error ? err.message : "Count tasks could not be loaded."); } })
            .finally(() => { if (!controller.signal.aborted && !relocated) setLoading(false); });
        return () => controller.abort();
    }, [token, page, showFinished, reload, refresh]);
    function reloadList() { setLoading(true); setReload(value => value + 1); }
    async function open(id: string) {
        if (blocked || opening || selected) return;
        const current = ++generation.current; setOpening(true); setError(null); setMessage(null); onEditorChange(true);
        try { const result = await read<Count>(`/api/stock-counts/${id}`, token); if (current === generation.current) setSelected(result); }
        catch (err) { if (current === generation.current) { setError(err instanceof Error ? err.message : "Count could not be opened."); onEditorChange(false); } }
        finally { if (current === generation.current) setOpening(false); }
    }
    function close() { generation.current++; setSelected(null); setOpening(false); onEditorChange(false); reloadList(); }
    function changed(count: Count, text: string) {
        setMessage(`${trackingCode("CNT", count)} · ${text}`); close();
    }
    const locked = blocked || opening || !!selected;
    return <section className="mb-6 min-w-0 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm sm:p-5" aria-label="Stock count approval tasks">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#39291f]">Stock count approvals</h2><p className="mt-1 text-sm text-stone-600">Submitted physical counts and opening stock for your branch. Any eligible branch manager can review them.</p></div>
            <button type="button" className={button} disabled={locked || loading} onClick={reloadList}>Refresh counts</button></header>
        {blocked && <p className="mb-3 text-sm text-amber-900">Close the other open editor before opening a count.</p>}
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
        {message && <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}
        {opening && <p role="status">Opening count…</p>}
        {selected && <CountPanel key={`${selected.id}:${selected.version}`} count={selected} token={token} actor={actor} onClose={close} onChanged={changed} />}
        {loading ? <p role="status" className="text-sm text-stone-600">Loading count tasks…</p> : listing && <>
            <p className="mb-3 text-sm text-stone-600">{listing.totalItems} {showFinished ? "submitted or approved counts" : "counts awaiting approval"}</p>
            <ul className="grid gap-3 xl:grid-cols-2">{listing.items.map(item => <li key={item.id} className="min-w-0 rounded-xl border border-stone-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono text-sm text-amber-900">{trackingCode("CNT", item)}</strong><CountStatus status={item.status} /></div>
                <p className="mt-2 font-medium">{item.kind === "OPENING" ? "Opening stock" : "Physical stock count"} · {item.branch.code}</p><p className="mt-1 text-sm text-stone-600">{item.businessDate.slice(0, 10)} · {trackedUser(item.createdBy)}</p>
                <button type="button" className={`${button} mt-3 w-full`} disabled={locked} onClick={() => { void open(item.id); }}>{item.status === "SUBMITTED" ? "Review count" : "View approved count"}</button>
            </li>)}</ul>
            {!listing.items.length && <p className="rounded-lg bg-[#faf5ed] p-4 text-sm text-stone-600">{showFinished ? "No submitted or approved counts match." : "No counts are awaiting your branch's approval."}</p>}
            <nav aria-label="Count task pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span>Page {page}</span><div className="flex gap-2"><button type="button" className={button} disabled={locked || page <= 1} onClick={() => { setPage(page - 1); setLoading(true); }}>Previous counts</button><button type="button" className={button} disabled={locked || page * listing.pageSize >= listing.totalItems} onClick={() => { setPage(page + 1); setLoading(true); }}>Next counts</button></div></nav>
        </>}
        <footer className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-100 pt-3 text-sm"><Link href="/dashboard/stock-counts" className="text-amber-900 underline">All stock counts</Link><Link href="/dashboard/stock" className="text-amber-900 underline">Receiving & stock</Link><span className="text-stone-500">Manual receipts post when inventory confirms them; they have no separate manager approval.</span></footer>
    </section>;
}
