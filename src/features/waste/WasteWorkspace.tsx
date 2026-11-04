"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { jwtDecode } from "jwt-decode";
import Sidebar from "@/components/layout/Sidebar";
import { useStoredValue } from "@/hooks/useStoredValue";
import { createEditorToken } from "../dailyRequest/createEditorToken";
import { canViewStock } from "../stock/stockPolicy";
import { trackingCode, trackedUser } from "@/lib/trackingCode";

type Actor = { userId: string; branchId: string; roleCode: string };
type User = { username: string; trackingNumber?: number };
type Product = { id: string; code: string; displayName: string; unit: string; isActive: boolean };
type Waste = { id: string; trackingNumber: number; version: number; status: string; branchId: string; businessDate: string; note: string; createdById: string;
    createdBy: User; approvedBy: User | null; reversedBy: User | null; approvedAt: string | null; reversedAt: string | null; approvalReason: string | null; reversalReason: string | null;
    branch: { code: string }; lines: { productId: string; quantity: string; reason: string; note: string | null; product: Product }[];
    events: { id: string; action: string; note: string | null; version: number; createdAt: string; actor: User }[] };
type Item = Pick<Waste, "id" | "trackingNumber" | "version" | "status" | "businessDate" | "note" | "createdBy" | "branch"> & { _count: { lines: number } };
type Options = { products: Product[]; branches: { id: string; code: string; name: string }[] };
type Listing = { items: Item[]; totalItems: number; pageSize: number };
type Action = "submit" | "approve" | "return" | "reverse" | "cancel";
const field = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-[#cbb79f] bg-white px-3 py-2 text-base text-[#39291f] focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100 disabled:text-stone-600";
const primary = "min-h-11 rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-950 disabled:opacity-50";
const secondary = "min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50 disabled:opacity-50";
const reasonNames: Record<string, string> = { EXPIRED: "Expired", DAMAGED: "Damaged", SPOILED: "Spoiled", OTHER: "Other" };
async function api<T>(url: string, token: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { method, signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json(); if (!response.ok || !value.success) throw new Error(value.error?.message ?? "Waste operation failed."); return value.data;
}
function WasteStatus({ status }: { status: string }) {
    const colors: Record<string, string> = { DRAFT: "bg-amber-100 text-amber-900", SUBMITTED: "bg-sky-100 text-sky-900", APPROVED: "bg-emerald-100 text-emerald-900", REVERSED: "bg-violet-100 text-violet-900", CANCELLED: "bg-stone-100 text-stone-700" };
    return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${colors[status] ?? "bg-stone-100 text-stone-700"}`}>{status}</span>;
}
export default function WasteWorkspace() {
    const token = useStoredValue("token") ?? ""; let actor: Actor | null = null;
    try { if (token) actor = jwtDecode<Actor>(token); } catch { /* The API verifies authentication. */ }
    if (!actor || !canViewStock(actor.roleCode)) return <p>Please <Link href="/login" className="underline">sign in</Link> with a stock-authorized account.</p>;
    return <WastePageView key={token} token={token} actor={actor} />;
}
function WastePageView({ token, actor }: { token: string; actor: Actor }) {
    const [menu, setMenu] = useState(false);
    return <div className="min-h-screen bg-[#faf5ed] text-[#39291f]"><Sidebar isOpen={menu} onClose={() => setMenu(false)} /><main className="mx-auto min-w-0 max-w-[1500px] p-4 sm:p-6 lg:pl-28">
        <header className="mb-5"><button type="button" className={`${secondary} mb-3 lg:hidden`} onClick={() => setMenu(true)}>Menu</button><p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Branch stock</p><h1 className="mt-1 text-2xl font-semibold">Waste & damage</h1><p className="mt-2 max-w-3xl text-sm text-stone-600">Record expired, damaged or spoiled stock. Inventory submits a draft; a branch manager approves the deduction. Drafts do not change stock.</p></header>
        <WasteCases token={token} actor={actor} />
    </main></div>;
}
export function WasteTaskQueue({ token, showFinished, refresh, blocked, onEditorChange }: { token: string; showFinished: boolean; refresh: number; blocked: boolean; onEditorChange: (open: boolean) => void }) {
    let actor: Actor | null = null; try { actor = jwtDecode<Actor>(token); } catch { /* API validates. */ }
    if (!actor || actor.roleCode !== "BM") return null;
    return <WasteCases key={`${token}:${showFinished}`} token={token} actor={actor} tasks showFinished={showFinished} externalRefresh={refresh} blocked={blocked} onEditorChange={onEditorChange} />;
}
function WasteCases({ token, actor, tasks = false, showFinished = false, externalRefresh = 0, blocked = false, onEditorChange }: {
    token: string; actor: Actor; tasks?: boolean; showFinished?: boolean; externalRefresh?: number; blocked?: boolean; onEditorChange?: (open: boolean) => void;
}) {
    const [options, setOptions] = useState<Options>({ products: [], branches: [] }), [optionError, setOptionError] = useState<string | null>(null);
    const [listing, setListing] = useState<Listing | null>(null), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [finished, setFinished] = useState(showFinished);
    const [branch, setBranch] = useState(""), [reference, setReference] = useState("");
    const [loading, setLoading] = useState(true), [opening, setOpening] = useState(false), [creating, setCreating] = useState(false), [selected, setSelected] = useState<Waste | null>(null);
    const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null), generation = useRef(0);
    const visibleFinished = tasks ? showFinished : finished;
    useEffect(() => {
        if (tasks) return;
        const controller = new AbortController();
        api<Options>("/api/waste/options", token, "GET", undefined, controller.signal).then(value => { if (!controller.signal.aborted) { setOptions(value); setOptionError(null); } }).catch((err: unknown) => { if (!controller.signal.aborted) setOptionError(err instanceof Error ? err.message : "Options could not be loaded."); });
        return () => controller.abort();
    }, [token, tasks, refresh]);
    useEffect(() => {
        const controller = new AbortController(); let relocated = false;
        const query = new URLSearchParams({ page: String(page), showFinished: String(visibleFinished), tasks: String(tasks) });
        if (branch) query.set("branchId", branch); if (reference) query.set("reference", reference);
        api<Listing>(`/api/waste?${query}`, token, "GET", undefined, controller.signal).then(value => {
            if (controller.signal.aborted) return;
            const last = Math.max(1, Math.ceil(value.totalItems / value.pageSize));
            if (page > last) { relocated = true; setPage(last); return; }
            setListing(value); setError(null);
        }).catch((err: unknown) => { if (!controller.signal.aborted) { setListing(null); setError(err instanceof Error ? err.message : "Waste cases could not be loaded."); } }).finally(() => { if (!controller.signal.aborted && !relocated) setLoading(false); });
        return () => controller.abort();
    }, [token, tasks, page, visibleFinished, branch, reference, refresh, externalRefresh]);
    const locked = blocked || opening || creating || !!selected;
    function reload() { setLoading(true); setRefresh(value => value + 1); }
    async function open(id: string) {
        if (locked) return; const current = ++generation.current; setOpening(true); setError(null); setMessage(null); onEditorChange?.(true);
        try { const value = await api<Waste>(`/api/waste/${id}`, token); if (current === generation.current) setSelected(value); }
        catch (err) { if (current === generation.current) { setError(err instanceof Error ? err.message : "Case could not be opened."); onEditorChange?.(false); } }
        finally { if (current === generation.current) setOpening(false); }
    }
    function close() { generation.current++; setSelected(null); setCreating(false); setOpening(false); onEditorChange?.(false); reload(); }
    function changed(item: Waste, text: string) {
        setMessage(`${trackingCode("WST", item)} · ${text}`);
        if (tasks || actor.roleCode !== "INV" || item.status !== "DRAFT") close();
        else { setCreating(false); setSelected(item); reload(); }
    }
    function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = new FormData(event.currentTarget).get("reference"); setReference(typeof value === "string" ? value.trim() : ""); setPage(1); reload(); }
    return <section className="mb-6 min-w-0 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm sm:p-5" aria-label={tasks ? "Waste approval tasks" : "Waste cases"}>
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{tasks ? "Waste & damage approvals" : "Waste cases"}</h2><p className="mt-1 text-sm text-stone-600">{tasks ? "Submitted waste cases for your branch. Review quantities and reasons before deducting stock." : "Approval checks the current ledger. Cancellation keeps a draft's audit history; reversal restores an approved deduction."}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={secondary} disabled={locked || loading} onClick={reload}>{tasks ? "Refresh waste" : "Refresh"}</button>{!tasks && actor.roleCode === "INV" && <button type="button" className={primary} disabled={locked || !options.products.length} onClick={() => { setCreating(true); setMessage(null); }}>Record waste</button>}</div></header>
        {blocked && <p className="mb-3 text-sm text-amber-900">Close the other open editor before reviewing waste.</p>}
        {(error || optionError) && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-red-800">{error ?? optionError}</p>}{message && <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}
        {opening && <p role="status">Opening waste case…</p>}
        {creating && <WasteEditor token={token} products={options.products} onClose={close} onSaved={item => changed(item, item.status === "DRAFT" ? "Draft saved. Stock is unchanged." : "Existing case reloaded. No duplicate case was created.")} />}
        {selected && <WastePanel key={`${selected.id}:${selected.version}`} item={selected} token={token} actor={actor} products={options.products} onClose={close} onChanged={changed} />}
        {!tasks && <div className="mb-5 grid min-w-0 gap-4 md:grid-cols-2"><form onSubmit={search} className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto]"><label className="block min-w-0 text-sm">Waste code<input name="reference" maxLength={14} placeholder="WST-000001" disabled={locked} className={field} /></label><button type="submit" disabled={locked} className={`${secondary} self-end`}>Search</button></form>{actor.roleCode === "ADMIN" && <label className="block min-w-0 text-sm">Branch<select className={field} value={branch} disabled={locked} onChange={event => { setBranch(event.target.value); setPage(1); setLoading(true); }}><option value="">All branches</option>{options.branches.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={finished} disabled={locked} onChange={event => { setFinished(event.target.checked); setPage(1); setLoading(true); }} />Show finished items</label></div>}
        {loading ? <p role="status" className="text-sm text-stone-600">Loading waste cases…</p> : listing && <><p className="mb-3 text-sm text-stone-600">{listing.totalItems} {tasks && !visibleFinished ? "cases awaiting approval" : "matching cases"}</p>
            <ul className="grid gap-3 xl:grid-cols-2">{listing.items.map(item => <li key={item.id} className="min-w-0 rounded-xl border border-stone-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono text-sm text-amber-900">{trackingCode("WST", item)}</strong><WasteStatus status={item.status} /></div><p className="mt-2 text-sm">{item.branch.code} · {item.businessDate.slice(0, 10)} · {item._count.lines} products</p><p className="mt-1 text-sm text-stone-600">{trackedUser(item.createdBy)}</p><p className="mt-2 break-words text-sm text-stone-600">{item.note}</p><button type="button" className={`${secondary} mt-3 w-full`} disabled={locked} onClick={() => { void open(item.id); }}>{tasks && item.status === "SUBMITTED" ? "Review waste" : "Open waste case"}</button></li>)}</ul>
            {!listing.items.length && <p className="rounded-lg bg-[#faf5ed] p-4 text-sm text-stone-600">{tasks ? "No waste cases need your branch's review under these filters." : "No waste cases match. Enable Show finished items to review approved, reversed and cancelled cases."}</p>}
            <nav aria-label="Waste pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span>Page {page}</span><div className="flex gap-2"><button type="button" className={secondary} disabled={locked || page <= 1} onClick={() => { setPage(page - 1); setLoading(true); }}>Previous waste</button><button type="button" className={secondary} disabled={locked || page * listing.pageSize >= listing.totalItems} onClick={() => { setPage(page + 1); setLoading(true); }}>Next waste</button></div></nav>
        </>}
        {tasks && <Link href="/dashboard/waste" className="mt-4 inline-block text-sm text-amber-900 underline">All waste & damage cases</Link>}
    </section>;
}
function localBusinessDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
function WasteEditor({ token, item, products, onClose, onSaved }: { token: string; item?: Waste; products: Product[]; onClose: () => void; onSaved: (item: Waste) => void }) {
    const [clientRequestId] = useState(createEditorToken), [date, setDate] = useState(() => item?.businessDate.slice(0, 10) ?? localBusinessDate()), [note, setNote] = useState(item?.note ?? "");
    const [lines, setLines] = useState(() => item?.lines.map(line => ({ productId: line.productId, quantity: String(line.quantity), reason: line.reason, note: line.note ?? "" })) ?? [{ productId: "", quantity: "", reason: "EXPIRED", note: "" }]);
    const [initial] = useState(() => JSON.stringify({ date, note, lines })), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), sending = useRef(false);
    const dirty = JSON.stringify({ date, note, lines }) !== initial;
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); if (sending.current) return; sending.current = true; setBusy(true); setError(null);
        try { const result = await api<Waste>(`/api/waste${item ? `/${item.id}` : ""}`, token, item ? "PATCH" : "POST", { businessDate: date, note, lines, ...(item ? { version: item.version } : { clientRequestId }) }); onSaved(result); }
        catch (err) { setError(err instanceof Error ? err.message : "Draft could not be saved."); }
        finally { sending.current = false; setBusy(false); }
    }
    return <section className="my-4 rounded-xl border border-amber-200 bg-[#fffcf6] p-4" aria-label="Waste draft editor"><h3 className="text-lg font-semibold">{item ? "Edit saved waste draft" : "Record a waste draft"}</h3><p className="mt-1 text-sm text-stone-600">Enter positive quantities. Stock is deducted only after manager approval. Inactive products may still have stock to write off.</p><form className="mt-4" onSubmit={save}><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Business date<input required type="date" value={date} disabled={busy} className={field} onChange={event => setDate(event.target.value)} /></label><label className="text-sm">Case note<textarea required minLength={5} maxLength={1000} value={note} disabled={busy} className={field} onChange={event => setNote(event.target.value)} /></label></div>
        <div className="mt-4 space-y-4">{lines.map((line, index) => { const product = products.find(item => item.id === line.productId); return <div key={index} className="grid min-w-0 gap-3 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4"><label className="block min-w-0 text-sm">Product<select required value={line.productId} disabled={busy} className={field} onChange={event => setLines(values => values.map((value, i) => i === index ? { ...value, productId: event.target.value } : value))}><option value="">Choose product</option>{products.map(item => <option key={item.id} value={item.id} disabled={lines.some((value, i) => i !== index && value.productId === item.id)}>{item.code} · {item.displayName} ({item.unit}){item.isActive ? "" : " · inactive"}</option>)}</select></label><label className="text-sm">Waste quantity {product ? `(${product.unit})` : ""}<input required type="number" min={product?.unit === "PCS" || product?.unit === "BOX" ? "1" : "0.001"} max="999999999.999" step={product?.unit === "PCS" || product?.unit === "BOX" ? "1" : "0.001"} value={line.quantity} disabled={busy} className={field} onChange={event => setLines(values => values.map((value, i) => i === index ? { ...value, quantity: event.target.value } : value))} /></label><label className="text-sm">Reason<select value={line.reason} disabled={busy} className={field} onChange={event => setLines(values => values.map((value, i) => i === index ? { ...value, reason: event.target.value } : value))}>{Object.entries(reasonNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="text-sm">Product note {line.reason === "OTHER" ? "(required)" : "(optional)"}<input required={line.reason === "OTHER"} minLength={line.reason === "OTHER" ? 5 : undefined} maxLength={1000} value={line.note} disabled={busy} className={field} onChange={event => setLines(values => values.map((value, i) => i === index ? { ...value, note: event.target.value } : value))} /></label><button type="button" disabled={busy || lines.length <= 1} className={`${secondary} justify-self-start text-red-800`} onClick={() => setLines(values => values.filter((_, i) => i !== index))}>Remove product</button></div>; })}</div>
        <button type="button" disabled={busy || lines.length >= 200} className={`${secondary} mt-3`} onClick={() => setLines(values => [...values, { productId: "", quantity: "", reason: "EXPIRED", note: "" }])}>Add product</button>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}<div className="mt-4 flex flex-col gap-3 sm:flex-row"><button type="submit" disabled={busy || (!!item && !dirty)} className={primary}>{busy ? "Saving…" : "Save draft"}</button><button type="button" disabled={busy} className={secondary} onClick={() => { if (!dirty || window.confirm("Discard unsaved waste draft changes?")) onClose(); }}>Close draft</button></div>
    </form></section>;
}
function WastePanel({ item, token, actor, products, onClose, onChanged }: { item: Waste; token: string; actor: Actor; products: Product[]; onClose: () => void; onChanged: (item: Waste, text: string) => void }) {
    const [editing, setEditing] = useState(false), [decision, setDecision] = useState<Action | null>(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), sending = useRef(false);
    const ownDraft = actor.roleCode === "INV" && item.branchId === actor.branchId && item.createdById === actor.userId && item.status === "DRAFT";
    const manager = actor.roleCode === "BM" && item.branchId === actor.branchId && item.createdById !== actor.userId;
    function choose(action: Action) { setDecision(action); setReason(action === "submit" ? "Submit saved waste quantities for manager review." : ""); setError(null); }
    async function perform() {
        if (!decision || sending.current) return; sending.current = true; setBusy(true); setError(null);
        try { const result = await api<Waste>(`/api/waste/${item.id}/${decision}`, token, "POST", { version: item.version, reason }); onChanged(result, decision === "approve" ? "Approved. Waste was deducted once." : decision === "reverse" ? "Reversed. Waste quantities were restored once." : decision === "return" ? "Returned to inventory for correction. Stock is unchanged." : decision === "cancel" ? "Draft cancelled. Stock is unchanged." : "Submitted for manager approval. Stock is unchanged."); }
        catch (err) { setError(err instanceof Error ? err.message : "Waste action failed."); }
        finally { sending.current = false; setBusy(false); }
    }
    if (editing) return <WasteEditor token={token} item={item} products={products} onClose={() => setEditing(false)} onSaved={value => onChanged(value, "Draft updated. Stock is unchanged.")} />;
    const questions: Record<Action, string> = { submit: "Send these saved waste quantities to a branch manager? Stock will stay unchanged until approval.", approve: "Deduct these quantities from branch stock? Approval checks current balances and cannot make stock negative.", return: "Return this case to its inventory creator for correction? No stock will change.", reverse: "Restore all quantities deducted by this case? The original movements remain in history. This reversal cannot be undone; record a new case for corrected waste.", cancel: "Cancel this unposted draft? It will remain in history and will not change stock." };
    return <section className="my-4 min-w-0 rounded-xl border border-[#d9c7af] bg-[#fffcf6] p-4" aria-label="Waste case detail"><header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{trackingCode("WST", item)} · Waste & damage</h3><div className="mt-2"><WasteStatus status={item.status} /></div><p className="mt-2 text-sm text-stone-600">{item.branch.code} · {item.businessDate.slice(0, 10)} · {trackedUser(item.createdBy)}</p></div><button type="button" disabled={busy} className={secondary} onClick={onClose}>Close waste case</button></header><p className="my-4 whitespace-pre-wrap break-words text-sm">{item.note}</p>
        <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-[#efe2cf]"><tr>{["Product", "Waste quantity", "Reason", "Product note"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{item.lines.map(line => <tr key={line.productId} className="border-b border-stone-200"><td className="p-3">{line.product.code} · {line.product.displayName}</td><td className="p-3 font-semibold tabular-nums">{String(line.quantity)} {line.product.unit}</td><td className="p-3">{reasonNames[line.reason] ?? line.reason}</td><td className="max-w-xs whitespace-pre-wrap break-words p-3">{line.note ?? "—"}</td></tr>)}</tbody></table></div>
        {item.approvedAt && <p className="mt-3 text-sm text-emerald-900">Approved by {trackedUser(item.approvedBy)} · {new Date(item.approvedAt).toLocaleString()} · {item.approvalReason}</p>}{item.reversedAt && <p className="mt-3 text-sm text-violet-900">Reversed by {trackedUser(item.reversedBy)} · {new Date(item.reversedAt).toLocaleString()} · {item.reversalReason}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
        {!decision && <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{ownDraft && <><button type="button" className={secondary} onClick={() => setEditing(true)}>Edit waste draft</button><button type="button" className={primary} onClick={() => choose("submit")}>Submit for approval</button><button type="button" className={`${secondary} text-red-800`} onClick={() => choose("cancel")}>Cancel draft</button></>}{manager && item.status === "SUBMITTED" && <><button type="button" className={primary} onClick={() => choose("approve")}>Approve deduction</button><button type="button" className={secondary} onClick={() => choose("return")}>Return to inventory</button></>}{manager && item.status === "APPROVED" && <button type="button" className={secondary} onClick={() => choose("reverse")}>Reverse waste deduction</button>}</div>}
        {decision && <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Confirm waste action"><p className="text-sm">{questions[decision]}</p>{decision !== "submit" && <label className="mt-3 block text-sm">Reason<input required minLength={5} maxLength={1000} value={reason} disabled={busy} className={field} onChange={event => setReason(event.target.value)} /></label>}<div className="mt-4 flex flex-col gap-3 sm:flex-row"><button type="button" disabled={busy || reason.trim().length < 5} className={primary} onClick={() => { void perform(); }}>{busy ? "Processing…" : "Confirm action"}</button><button type="button" disabled={busy} className={secondary} onClick={() => setDecision(null)}>Keep case unchanged</button></div></section>}
        <h4 className="mb-2 mt-5 font-semibold">Case history</h4><ul className="space-y-2 text-sm">{item.events.map(event => <li key={event.id} className="rounded-lg bg-white p-3"><strong>{event.action}</strong> · {trackedUser(event.actor)} · {new Date(event.createdAt).toLocaleString()}{event.note && <p className="mt-1 whitespace-pre-wrap break-words text-stone-600">{event.note}</p>}</li>)}</ul>
    </section>;
}
