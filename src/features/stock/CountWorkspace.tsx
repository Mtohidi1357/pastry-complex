"use client";
import CountStatus from "./CountStatus";
import { trackingCode, trackedUser } from "@/lib/trackingCode";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { jwtDecode } from "jwt-decode";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import { useStoredValue } from "@/hooks/useStoredValue";
import { createEditorToken } from "../dailyRequest/createEditorToken";
import { canViewStock } from "./stockPolicy";

export type Actor = { userId: string; roleCode: string; branchId: string };
type Product = { id: string; code: string; displayName: string; unit: string; isActive?: boolean };
export type Count = { id: string; trackingNumber?: number; kind: "OPENING" | "COUNT"; status: "DRAFT" | "SUBMITTED" | "APPROVED"; branchId: string; version: number;
    businessDate: string; note: string | null; approvalReason: string | null; approvedAt: string | null; createdById: string;
    createdBy: { username: string; trackingNumber?: number }; approvedBy: { username: string; trackingNumber?: number } | null; branch: { code: string };
    lines: { productId: string; expectedQuantity: string; countedQuantity: string | null; product: Product }[];
    events: { id: string; action: string; createdAt: string; note: string | null; actor: { username: string; trackingNumber?: number } }[] };
type Listing = { items: Count[]; totalItems: number; pageSize: number };
type Options = { products: Product[]; branches: { id: string; code: string; name: string }[] };
const field = "mt-1 block w-full rounded-lg border border-[#d9c7b1] bg-white px-3 py-2 text-sm text-[#39291f] focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100";
const primary = "rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const secondary = "rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-50";
async function api<T>(url: string, token: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { method, signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error?.message ?? "Stock count operation failed."); return result.data;
}
function delta(physical: string | null, expected: string) {
    if (physical === null || !/^\d+(?:\.\d{1,3})?$/.test(physical)) return "—";
    const scaled = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0")); };
    const value = scaled(physical) - scaled(expected), positive = value >= BigInt(0), absolute = positive ? value : -value;
    return `${positive && value !== BigInt(0) ? "+" : positive ? "" : "-"}${absolute / BigInt(1000)}.${String(absolute % BigInt(1000)).padStart(3, "0")}`;
}
export default function CountWorkspace() {
    const token = useStoredValue("token") ?? "";
    let actor: Actor | null = null; try { if (token) actor = jwtDecode<Actor>(token); } catch { /* Server validates the token. */ }
    if (!actor || !canViewStock(actor.roleCode)) return <p>Please <Link href="/login" className="underline">sign in</Link> with a stock-authorized account.</p>;
    return <CountView key={token} token={token} actor={actor} />;
}
function CountView({ token, actor }: { token: string; actor: Actor }) {
    const [menu, setMenu] = useState(false), [options, setOptions] = useState<Options>({ products: [], branches: [] });
    const [listing, setListing] = useState<Listing | null>(null), [loading, setLoading] = useState(true), [opening, setOpening] = useState(false);
    const [error, setError] = useState<string | null>(null), [optionError, setOptionError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
    const [page, setPage] = useState(1), [branch, setBranch] = useState(""), [refresh, setRefresh] = useState(0), [creating, setCreating] = useState(false);
    const [selected, setSelected] = useState<Count | null>(null), generation = useRef(0);
    const [showFinished, setShowFinished] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        api<Options>("/api/stock-counts/options", token, "GET", undefined, controller.signal).then(value => { if (!controller.signal.aborted) { setOptions(value); setOptionError(null); } }).catch((err: unknown) => { if (!controller.signal.aborted) setOptionError(err instanceof Error ? err.message : "Products could not be loaded."); });
        return () => controller.abort();
    }, [token, refresh]);
    useEffect(() => {
        const controller = new AbortController(), query = new URLSearchParams({ page: String(page) }); if (branch) query.set("branchId", branch); query.set("showFinished", String(showFinished));
        let relocated = false;
        api<Listing>(`/api/stock-counts?${query}`, token, "GET", undefined, controller.signal).then(value => { if (!controller.signal.aborted) {
                const lastPage = Math.max(1, Math.ceil(value.totalItems / value.pageSize));
                if (page > lastPage) { relocated = true; setPage(lastPage); return; }
                setListing(value); setError(null);
            } }).catch((err: unknown) => { if (!controller.signal.aborted) { setListing(null); setError(err instanceof Error ? err.message : "Counts could not be loaded."); } }).finally(() => { if (!controller.signal.aborted && !relocated) setLoading(false); });
        return () => controller.abort();
    }, [token, page, branch, refresh, showFinished]);
    async function open(id: string) {
        const current = ++generation.current; setOpening(true); setError(null); setMessage(null);
        try { const result = await api<Count>(`/api/stock-counts/${id}`, token); if (current === generation.current) setSelected(result); }
        catch (err) { if (current === generation.current) setError(err instanceof Error ? err.message : "Count could not be opened."); }
        finally { if (current === generation.current) setOpening(false); }
    }
    function changed(count: Count, text: string) { setCreating(false); setSelected(count); setMessage(text); setLoading(true); setRefresh(value => value + 1); }
    function close() { generation.current++; setCreating(false); setSelected(null); setOpening(false); }
    return <div className="min-h-screen bg-[#faf5ed] text-[#39291f]"><Sidebar isOpen={menu} onClose={() => setMenu(false)} />
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:pl-28"><header className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><button type="button" className={`${secondary} mb-2 lg:hidden`} onClick={() => setMenu(true)}>Menu</button><p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Inventory reconciliation</p><h1 className="mt-1 text-2xl font-semibold">Opening stock & physical counts</h1></div><div className="flex flex-wrap gap-3"><Link href="/dashboard/stock" className={secondary}>Receiving & stock</Link><button type="button" disabled={loading} className={secondary} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Refresh list</button>{actor.roleCode === "INV" && <button type="button" disabled={creating || !!selected || opening} className={primary} onClick={() => { setCreating(true); setMessage(null); }}>Start a count</button>}</div></header>
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Start a snapshot before counting. Inventory enters physical quantities; a manager approves the difference. If stock moves after the snapshot, inventory must refresh and recount. Opening stock is only for products with no ledger history. For existing stock, use Physical count.</p>
            {(error || optionError) && <p role="alert" className="mb-4 rounded bg-red-100 p-3 text-red-800">{error ?? optionError}</p>}{message && <p role="status" className="mb-4 rounded bg-green-100 p-3 text-green-900">{message}</p>}
            {creating && <StartCount token={token} products={options.products} onClose={close} onStarted={count => changed(count, "Snapshot captured. Enter freshly counted physical quantities; stock has not changed.")} />}
            {opening && <p role="status">Opening count…</p>}{selected && <CountPanel key={`${selected.id}:${selected.version}`} count={selected} token={token} actor={actor} onClose={close} onChanged={changed} />}
            <section className="mt-5 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm"><label className="mb-4 block max-w-xs text-sm">Branch<select value={branch} disabled={creating || !!selected} className={field} onChange={event => { setBranch(event.target.value); setPage(1); setLoading(true); }}><option value="">{actor.roleCode === "ADMIN" ? "All branches" : "My branch"}</option>{options.branches.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                <label className="mb-4 flex items-center gap-2 text-sm" title="Include approved opening balances and physical counts."><input type="checkbox" checked={showFinished} disabled={creating || !!selected || opening} onChange={event => { setShowFinished(event.target.checked); setPage(1); setLoading(true); }} />Show finished items</label>
                {loading ? <p role="status">Loading counts…</p> : listing && <><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-[#f7efe3]"><tr>{["Count", "Kind", "Branch", "Business date", "Status", "Started by", ""].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{listing.items.map(item => <tr key={item.id} className="border-t"><td className="max-w-52 break-all p-3 font-mono text-xs">{trackingCode("CNT", item)}</td><td className="p-3">{item.kind === "OPENING" ? "Opening stock" : "Physical count"}</td><td className="p-3">{item.branch.code}</td><td className="p-3">{item.businessDate.slice(0, 10)}</td><td className="p-3"><CountStatus status={item.status} /></td><td className="p-3">{trackedUser(item.createdBy)}</td><td className="p-3"><button type="button" className={secondary} disabled={creating || !!selected || opening} onClick={() => { void open(item.id); }}>Open count</button></td></tr>)}</tbody></table>{!listing.items.length && <p className="p-5 text-sm text-stone-600">{showFinished ? "No counts match these filters." : "No unfinished counts match. Enable Show finished items to review approved counts."}</p>}</div><div className="mt-4 flex items-center justify-between gap-3 text-sm"><span>{listing.totalItems} counts · Page {page}</span><div className="flex gap-2"><button type="button" className={secondary} disabled={page <= 1 || creating || !!selected} onClick={() => { setPage(page - 1); setLoading(true); }}>Previous</button><button type="button" className={secondary} disabled={page * listing.pageSize >= listing.totalItems || creating || !!selected} onClick={() => { setPage(page + 1); setLoading(true); }}>Next</button></div></div></>}
            </section>
        </main>
    </div>;
}
function StartCount({ token, products, onClose, onStarted }: { token: string; products: Product[]; onClose: () => void; onStarted: (count: Count) => void }) {
    const [kind, setKind] = useState("COUNT"), [date, setDate] = useState(new Date().toISOString().slice(0, 10)), [ids, setIds] = useState<string[]>([]);
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [clientRequestId] = useState(() => createEditorToken());
    const sending = useRef(false);
    async function start(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); if (sending.current) return; sending.current = true; setBusy(true); setError(null);
        try { const result = await api<Count>("/api/stock-counts", token, "POST", { clientRequestId, kind, businessDate: date, productIds: ids }); onStarted(result); }
        catch (err) { setError(err instanceof Error ? err.message : "Snapshot could not be started."); }
        finally { sending.current = false; setBusy(false); }
    }
    return <section className="my-4 rounded-2xl border border-[#eadcc9] bg-white p-4"><h2 className="text-lg font-semibold">Start snapshot</h2><form className="mt-4" onSubmit={start}><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Kind<select className={field} value={kind} disabled={busy} onChange={event => setKind(event.target.value)}><option value="COUNT">Physical count · reconcile existing stock</option><option value="OPENING">Opening stock · products with no history</option></select></label><label className="text-sm">Business date<input required type="date" value={date} disabled={busy} onChange={event => setDate(event.target.value)} className={field} /></label></div><p className="my-3 text-sm text-stone-600">Choose up to 200 products. No physical quantities are entered until the snapshot is saved.</p><div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{products.map(product => <label key={product.id} className="flex items-center gap-3 rounded-lg bg-[#fcf8f2] p-3 text-sm"><input type="checkbox" checked={ids.includes(product.id)} disabled={busy || (ids.length >= 200 && !ids.includes(product.id))} onChange={event => setIds(values => event.target.checked ? [...values, product.id] : values.filter(id => id !== product.id))} /><span>{product.code} · {product.displayName} ({product.unit}){product.isActive === false ? " · inactive" : ""}</span></label>)}</div>{error && <p role="alert" className="mt-3 text-red-800">{error}</p>}<div className="mt-4 flex gap-3"><button type="submit" className={primary} disabled={busy || !ids.length}>{busy ? "Starting…" : "Capture snapshot"}</button><button type="button" className={secondary} disabled={busy} onClick={onClose}>Cancel</button></div></form></section>;
}
export function CountPanel({ count, token, actor, onClose, onChanged }: { count: Count; token: string; actor: Actor; onClose: () => void; onChanged: (count: Count, text: string) => void }) {
    const [quantities, setQuantities] = useState(() => Object.fromEntries(count.lines.map(line => [line.productId, line.countedQuantity === null ? "" : String(line.countedQuantity)])));
    const [note, setNote] = useState(count.note ?? ""), [reason, setReason] = useState(""), [decision, setDecision] = useState<"approve" | "return" | "refresh" | "submit" | null>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null); const sending = useRef(false);
    const editable = actor.roleCode === "INV" && count.createdById === actor.userId && count.branchId === actor.branchId && count.status === "DRAFT";
    const reviewable = actor.roleCode === "BM" && count.branchId === actor.branchId && count.status === "SUBMITTED" && count.createdById !== actor.userId;
    const dirty = note !== (count.note ?? "") || count.lines.some(line => quantities[line.productId] !== (line.countedQuantity === null ? "" : String(line.countedQuantity)));
    async function perform(action: "save" | "submit" | "refresh" | "approve" | "return") {
        if (sending.current) return; sending.current = true; setBusy(true); setError(null);
        const body = action === "save" ? { version: count.version, note, lines: count.lines.map(line => ({ productId: line.productId, countedQuantity: quantities[line.productId] })) } : { version: count.version, ...(action === "approve" || action === "return" ? { reason } : {}) };
        try { const result = await api<Count>(`/api/stock-counts/${count.id}${action === "save" ? "" : `/${action}`}`, token, action === "save" ? "PATCH" : "POST", body); onChanged(result, action === "approve" ? "Count approved. Only its stock differences were posted, once." : action === "refresh" ? "Snapshot refreshed. All physical quantities were cleared; recount before submission." : action === "submit" ? "Count submitted. Stock is unchanged until manager approval." : action === "return" ? "Count returned to inventory for correction." : "Physical quantities saved. Stock is unchanged."); }
        catch (err) { setError(err instanceof Error ? err.message : "Count operation failed."); }
        finally { sending.current = false; setBusy(false); }
    }
    return <section className="my-4 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm sm:p-6" aria-label="Stock count detail"><header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">{count.kind === "OPENING" ? "Opening stock" : "Physical count"} · <CountStatus status={count.status} /></h2><p className="mt-1 break-all font-mono text-xs text-stone-500">{trackingCode("CNT", count)}</p><p className="mt-2 text-sm">{count.branch.code} · {count.businessDate.slice(0, 10)} · Started by {trackedUser(count.createdBy)}</p></div><button type="button" className={secondary} disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved count changes?")) onClose(); }}>Close count</button></header>
        <form className="mt-4" onSubmit={event => { event.preventDefault(); void perform("save"); }}><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-[#f7efe3]"><tr>{["Product", "Unit", "Ledger snapshot", "Physical quantity", "Difference"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{count.lines.map(line => <tr key={line.productId} className="border-t"><td className="p-3">{line.product.code} · {line.product.displayName}</td><td className="p-3">{line.product.unit}</td><td className="p-3 tabular-nums">{String(line.expectedQuantity)}</td><td className="p-3">{editable ? <input required aria-label={`Physical quantity for ${line.product.code}`} type="number" min="0" step={line.product.unit === "PCS" || line.product.unit === "BOX" ? "1" : "0.001"} className={field} disabled={busy || decision !== null} value={quantities[line.productId]} onChange={event => setQuantities(values => ({ ...values, [line.productId]: event.target.value }))} /> : line.countedQuantity === null ? "—" : String(line.countedQuantity)}</td><td className="p-3 font-semibold tabular-nums">{delta(editable ? quantities[line.productId] : line.countedQuantity, String(line.expectedQuantity))}</td></tr>)}</tbody></table></div><label className="mt-4 block text-sm">Inventory count note<textarea maxLength={1000} required minLength={5} className={field} value={note} disabled={!editable || busy || decision !== null} onChange={event => setNote(event.target.value)} /></label>{editable && <div className="mt-4 flex flex-wrap items-center gap-3"><button type="submit" className={primary} disabled={busy || !dirty || decision !== null}>Save physical quantities</button><button type="button" className={secondary} disabled={busy || dirty || decision !== null || count.lines.some(line => line.countedQuantity === null) || (count.note?.trim().length ?? 0) < 5} onClick={() => setDecision("submit")}>Submit for approval</button><button type="button" className={secondary} disabled={busy || decision !== null} onClick={() => setDecision("refresh")}>Refresh snapshot & recount</button>{dirty && <span className="text-sm text-amber-900">Unsaved changes</span>}</div>}</form>
        {reviewable && <div className="mt-4 flex gap-3"><button type="button" className={primary} disabled={busy || decision !== null} onClick={() => setDecision("approve")}>Approve differences</button><button type="button" className={secondary} disabled={busy || decision !== null} onClick={() => setDecision("return")}>Return to inventory</button></div>}
        {decision && <section className="mt-4 rounded-xl bg-amber-50 p-4" aria-label="Confirm count action"><p className="text-sm">{decision === "refresh" ? "Refresh the ledger snapshot and clear ALL physical quantities? Count the products again afterward. Unsaved entries will be discarded." : decision === "submit" ? "Send the saved count to your manager? Stock will not change yet." : decision === "approve" ? "Approve the recorded differences and post them to stock? Approved counts are immutable; later corrections require a new count." : "Return this count to inventory? No stock will change."}</p>{(decision === "approve" || decision === "return") && <label className="mt-3 block text-sm">Manager reason<input minLength={5} maxLength={1000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className={field} /></label>}<div className="mt-3 flex gap-3"><button type="button" className={primary} disabled={busy || ((decision === "approve" || decision === "return") && reason.trim().length < 5)} onClick={() => { void perform(decision); }}>{busy ? "Processing…" : "Confirm action"}</button><button type="button" className={secondary} disabled={busy} onClick={() => setDecision(null)}>Go back</button></div></section>}
        {error && <p role="alert" className="mt-4 rounded bg-red-100 p-3 text-red-800">{error}</p>}{count.approvedAt && <p className="mt-4 rounded bg-green-50 p-3 text-sm text-green-900">Approved by {trackedUser(count.approvedBy)} · {new Date(count.approvedAt).toLocaleString()} · {count.approvalReason}</p>}
        <h3 className="mb-2 mt-5 font-semibold">Count history</h3><ul className="space-y-2 text-sm">{count.events.map(item => <li key={item.id} className="rounded-lg bg-stone-50 p-3"><strong>{item.action}</strong> · {trackedUser(item.actor)} · {new Date(item.createdAt).toLocaleString()}{item.note && <p className="mt-1 whitespace-pre-wrap text-stone-600">{item.note}</p>}</li>)}</ul>
    </section>;
}
