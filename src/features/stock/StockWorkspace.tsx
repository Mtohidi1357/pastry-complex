"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { jwtDecode } from "jwt-decode";
import Link from "next/link";
import AdminBalanceSheet from "./AdminBalanceSheet";
import Sidebar from "@/components/layout/Sidebar";
import { useStoredValue } from "@/hooks/useStoredValue";
import { createEditorToken } from "../dailyRequest/createEditorToken";
import { canViewStock } from "./stockPolicy";

type Actor = { userId: string; roleCode: string; branchId: string };
type Product = { id: string; code: string; displayName: string; unit: string; isActive?: boolean };
type Receipt = { id: string; businessDate: string; status: string; version: number; branchId: string; createdById: string; note: string | null;
    sourceType: string; sourceRequestId: string | null; confirmedAt: string | null; reversedAt: string | null; reversalReason: string | null;
    branch: { code: string; name?: string }; createdBy: { username: string }; confirmedBy?: { username: string } | null; reversedBy?: { username: string } | null;
    lines: { productId: string; quantity: string; product: Product }[] };
type Row = { id?: string; productId?: string; branch: { code: string }; product?: Product; quantity?: string; quantityDelta?: string;
    status?: string; businessDate?: string; postedAt?: string; kind?: string; actor?: { username: string }; reason?: string | null; receiptId?: string | null; sourceType?: string; sourceRequestId?: string | null; stockCount?: { id: string; kind: string } | null; receipt?: { sourceType: string; sourceRequestId: string | null } | null; createdBy?: { username: string } };
type Listing = { items: Row[]; totalItems: number; pageSize: number };
type Options = { products: Product[]; branches: { id: string; code: string; name: string }[] };
const input = "mt-1 w-full rounded-lg border border-[#d9c7b1] bg-white px-3 py-2 text-sm text-[#39291f] focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100";
const primary = "rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-950 disabled:opacity-50";
const secondary = "rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-50";
async function api<T>(url: string, token: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { method, signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error?.message ?? "Receiving operation failed.");
    return result.data;
}
export default function StockWorkspace() {
    const token = useStoredValue("token") ?? "";
    let actor: Actor | null = null;
    try { if (token) actor = jwtDecode<Actor>(token); } catch { /* Server validates authentication. */ }
    if (!actor || !canViewStock(actor.roleCode)) return <p>Please <Link href="/login" className="underline">sign in</Link> with a stock-authorized account.</p>;
    return <StockView key={token} token={token} actor={actor} />;
}
function movementSource(row: Row) { return row.kind === "OPENING_BALANCE" ? "Opening balance" : row.kind === "COUNT_ADJUSTMENT" ? "Count adjustment" : sourceName(row.receipt?.sourceType); }
function sourceName(value?: string) { return value === "REQUEST_RECEIVING" ? "Request receiving" : "Manual receiving"; }
function StockView({ token, actor }: { token: string; actor: Actor }) {
    const [menu, setMenu] = useState(false), [tab, setTab] = useState<"receipts" | "balances" | "movements">("receipts");
    const [branch, setBranch] = useState(""), [product, setProduct] = useState(""), [source, setSource] = useState(""), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
    const [options, setOptions] = useState<Options>({ products: [], branches: [] }), [optionError, setOptionError] = useState<string | null>(null);
    const [listing, setListing] = useState<Listing | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Receipt | null>(null), [opening, setOpening] = useState(false), [creating, setCreating] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [showFinished, setShowFinished] = useState(false);
    const openGeneration = useRef(0);
    const adminBalances = actor.roleCode === "ADMIN" && tab === "balances";
    useEffect(() => {
        const controller = new AbortController();
        api<Options>("/api/stock/options", token, "GET", undefined, controller.signal)
            .then(value => { if (!controller.signal.aborted) { setOptions(value); setOptionError(null); } })
            .catch((err: unknown) => { if (!controller.signal.aborted) setOptionError(err instanceof Error ? err.message : "Products could not be loaded."); });
        return () => controller.abort();
    }, [token, refresh]);
    useEffect(() => {
        if (adminBalances) return;
        const controller = new AbortController(), query = new URLSearchParams({ page: String(page) });
        if (branch) query.set("branchId", branch); if (product) query.set("productId", product);
        if (source && tab !== "balances") query.set("sourceType", source);
        if (tab === "receipts") query.set("showFinished", String(showFinished));
        let relocated = false;
        api<Listing>(`/api/stock/${tab}?${query}`, token, "GET", undefined, controller.signal)
            .then(value => { if (!controller.signal.aborted) {
                const lastPage = Math.max(1, Math.ceil(value.totalItems / value.pageSize));
                if (page > lastPage) { relocated = true; setPage(lastPage); return; }
                setListing(value); setError(null);
            } })
            .catch((err: unknown) => { if (!controller.signal.aborted) { setListing(null); setError(err instanceof Error ? err.message : "Stock could not be loaded."); } })
            .finally(() => { if (!controller.signal.aborted && !relocated) setLoading(false); });
        return () => controller.abort();
    }, [token, tab, branch, product, source, page, refresh, adminBalances, showFinished]);
    async function open(id: string) {
        if (creating) { setError("Close the new receipt form first."); return; }
        const generation = ++openGeneration.current;
        setOpening(true); setSelected(null); setError(null); setMessage(null);
        try { const result = await api<Receipt>(`/api/stock/receipts/${id}`, token); if (generation === openGeneration.current) setSelected(result); }
        catch (err) { if (generation === openGeneration.current) setError(err instanceof Error ? err.message : "Receipt could not be opened."); }
        finally { if (generation === openGeneration.current) setOpening(false); }
    }
    function changed(receipt: Receipt, text: string) { setCreating(false); setSelected(receipt); setMessage(text); setLoading(true); setRefresh(value => value + 1); }
    function closeReceipt() { openGeneration.current++; setSelected(null); setCreating(false); setOpening(false); }
    return <div className="min-h-screen bg-[#faf5ed] text-[#39291f]">
        <Sidebar isOpen={menu} onClose={() => setMenu(false)} />
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:pl-28">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><button type="button" onClick={() => setMenu(true)} className={`${secondary} mb-2 lg:hidden`}>Menu</button>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Branch stock · Receiving</p><h1 className="mt-1 text-2xl font-semibold">Receiving & stock</h1></div>
                <div className="flex flex-wrap gap-3"><Link href="/dashboard/stock-counts" className={secondary}>Physical stock counts</Link><button type="button" disabled={loading && !adminBalances} className={secondary} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Refresh</button>
                    {actor.roleCode === "INV" && <button type="button" className={primary} disabled={creating || !!selected || opening} onClick={() => { closeReceipt(); setCreating(true); setMessage(null); }}>New manual receipt</button>}</div></header>
            <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">This ledger combines receiving with manager-approved opening balances and stock-count adjustments. Historical stock is not imported automatically. Use Physical stock counts to establish or reconcile actual quantities; do not also enter those same goods as receipts.</p>
            {message && <p role="status" className="mb-4 rounded-lg bg-green-100 p-3 text-green-900">{message}</p>}
            {(error || optionError) && <p role="alert" className="mb-4 rounded-lg bg-red-100 p-3 text-red-800">{error ?? optionError}</p>}
            {creating && <ReceiptEditor key="new" token={token} products={options.products} onClose={closeReceipt} onSaved={receipt => changed(receipt, "Draft saved. Stock has not changed; confirm the receipt when checked.")} />}
            {opening && <p role="status">Opening receipt…</p>}
            {selected && <ReceiptPanel key={`${selected.id}:${selected.version}`} receipt={selected} token={token} actor={actor} products={options.products} onClose={closeReceipt} onChanged={changed} />}
            <section className="mt-5 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap gap-2">{(["receipts", "balances", "movements"] as const).map(value => <button key={value} type="button" disabled={creating || !!selected} className={tab === value ? primary : secondary}
                    onClick={() => { setTab(value); setError(null); if (value === "balances") setSource(""); setPage(1); setLoading(true); }}>{value === "receipts" ? "Receipts" : value === "balances" ? "Ledger balances" : "Movement history"}</button>)}</div>
                <div className="mb-4 flex flex-wrap gap-4">{!adminBalances && <label className="min-w-44 text-sm">Branch<select value={branch} disabled={creating || !!selected} className={input} onChange={event => { setBranch(event.target.value); setPage(1); setLoading(true); }}>
                    <option value="">{actor.roleCode === "ADMIN" ? "All branches" : "My branch"}</option>{options.branches.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>}
                    <label className="min-w-44 text-sm">Product<select value={product} disabled={creating || !!selected} className={input} onChange={event => { setProduct(event.target.value); setPage(1); setLoading(true); }}><option value="">All products</option>{options.products.map(item => <option key={item.id} value={item.id}>{item.code} · {item.displayName}</option>)}</select></label>
                    {tab === "receipts" && <label className="flex items-end gap-2 pb-2 text-sm" title="Include confirmed and reversed receipts, including request-generated receipts."><input type="checkbox" checked={showFinished} disabled={creating || !!selected || opening} onChange={event => { setShowFinished(event.target.checked); setPage(1); setLoading(true); }} />Show finished items</label>}
                    {tab !== "balances" && <label className="min-w-44 text-sm">Source<select value={source} disabled={creating || !!selected} className={input} onChange={event => { setSource(event.target.value); setPage(1); setLoading(true); }}><option value="">{tab === "movements" ? "All movement sources" : "Both receiving sources"}</option><option value="MANUAL_RECEIPT">Manual receiving</option><option value="REQUEST_RECEIVING">Request receiving</option></select></label>}
                </div>
                {adminBalances ? <AdminBalanceSheet token={token} productId={product} refresh={refresh} /> : loading ? <p role="status" className="p-4">Loading…</p> : listing && <>
                    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-[#f7efe3]"><tr>
                        {(tab === "receipts" ? ["Receipt / request reference", "Source", "Branch", "Business date", "Status", "Created by", ""] : tab === "balances" ? ["Branch", "Product", "Unit", "Ledger quantity"] : ["Posted", "Business date", "Source", "Branch", "Product", "Movement", "Quantity change", "Actor", "Reference / reason"]).map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
                        <tbody>{listing.items.map(row => <tr key={row.id ?? `${row.branch.code}:${row.productId}`} className="border-t border-stone-100 align-top">
                            {tab === "receipts" ? <><td className="max-w-52 break-all p-3 font-mono text-xs">{row.id}{row.sourceRequestId && <p className="mt-2 text-amber-900">Request: {row.sourceRequestId}</p>}</td><td className="p-3">{sourceName(row.sourceType)}</td><td className="p-3">{row.branch.code}</td><td className="p-3">{row.businessDate?.slice(0, 10)}</td><td className="p-3">{row.status}</td><td className="p-3">{row.createdBy?.username}</td><td className="p-3"><button type="button" disabled={creating || !!selected || opening} className={secondary} onClick={() => { if (row.id) void open(row.id); }}>Open receipt</button></td></> :
                                tab === "balances" ? <><td className="p-3">{row.branch.code}</td><td className="p-3">{row.product?.displayName}<small className="block text-stone-500">{row.product?.code}</small></td><td className="p-3">{row.product?.unit}</td><td className="p-3 font-semibold tabular-nums">{row.quantity}</td></> :
                                    <><td className="p-3 text-xs">{row.postedAt ? new Date(row.postedAt).toLocaleString() : "—"}</td><td className="p-3">{row.businessDate?.slice(0, 10)}</td><td className="p-3">{movementSource(row)}</td><td className="p-3">{row.branch.code}</td><td className="p-3">{row.product?.displayName} ({row.product?.unit})</td><td className="p-3 text-xs">{row.kind}</td><td className="p-3 font-semibold tabular-nums">{row.quantityDelta}</td><td className="p-3">{row.actor?.username}</td><td className="max-w-60 break-words p-3 text-xs">{row.stockCount && <p>Count: {row.stockCount.id}</p>}{row.receiptId}{row.receipt?.sourceRequestId && <p className="mt-1">Request: {row.receipt.sourceRequestId}</p>}<p className="mt-1">{row.reason}</p></td></>}
                        </tr>)}</tbody></table>{!listing.items.length && <p className="p-5 text-stone-600">{tab === "receipts" ? (showFinished ? "No receipts match these filters." : "No unfinished receipts match. Enable Show finished items to review confirmed request/manual receipts and reversals.") : "No ledger entries on this page. Products with no posted movements have a zero balance in this ledger."}</p>}</div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm"><span>{listing.totalItems} entries · Page {page}</span><div className="flex gap-2"><button type="button" className={secondary} disabled={page <= 1 || creating || !!selected} onClick={() => { setPage(page - 1); setLoading(true); }}>Previous</button><button type="button" className={secondary} disabled={page * listing.pageSize >= listing.totalItems || creating || !!selected} onClick={() => { setPage(page + 1); setLoading(true); }}>Next</button></div></div>
                </>}
            </section>
        </main>
    </div>;
}
function ReceiptEditor({ receipt, token, products, onClose, onSaved }: { receipt?: Receipt; token: string; products: Product[]; onClose: () => void; onSaved: (receipt: Receipt) => void }) {
    const [date, setDate] = useState(receipt?.businessDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    const [note, setNote] = useState(receipt?.note ?? "");
    const [lines, setLines] = useState(receipt?.lines.map(line => ({ productId: line.productId, quantity: String(line.quantity) })) ?? [{ productId: "", quantity: "" }]);
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const [clientRequestId] = useState(() => createEditorToken());
    const sending = useRef(false);
    const [initial] = useState(() => JSON.stringify({ businessDate: date, note, lines }));
    const dirty = JSON.stringify({ businessDate: date, note, lines }) !== initial;
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); if (sending.current) return;
        sending.current = true; setBusy(true); setError(null);
        try {
            const body = { businessDate: date, note, lines, ...(receipt ? { version: receipt.version } : { clientRequestId }) };
            const result = await api<Receipt>(`/api/stock/receipts${receipt ? `/${receipt.id}` : ""}`, token, receipt ? "PATCH" : "POST", body);
            onSaved(result);
        } catch (err) { setError(err instanceof Error ? err.message : "Draft could not be saved."); }
        finally { sending.current = false; setBusy(false); }
    }
    const choices = [...products, ...(receipt?.lines.map(line => line.product).filter(product => !products.some(option => option.id === product.id)) ?? [])];
    return <section className="my-4 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm sm:p-6" aria-label="Manual receipt draft">
        <h2 className="text-lg font-semibold">{receipt ? "Edit receipt draft" : "New manual receipt"}</h2><p className="mt-1 text-sm text-stone-600">Saving a draft does not change stock. Check the saved draft, then confirm it separately.</p>
        <form onSubmit={save} className="mt-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Business date<input type="date" required value={date} disabled={busy} onChange={event => setDate(event.target.value)} className={input} /></label><label className="text-sm">Receiving note<input value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} className={input} /></label></div>
            <div className="mt-4 space-y-3">{lines.map((line, index) => { const product = choices.find(item => item.id === line.productId); return <div key={index} className="grid items-end gap-3 rounded-xl bg-[#fcf8f2] p-3 sm:grid-cols-[1fr_10rem_auto]">
                <label className="text-sm">Product<select required value={line.productId} disabled={busy} className={input} onChange={event => setLines(values => values.map((value, position) => position === index ? { ...value, productId: event.target.value } : value))}><option value="">Choose product</option>{choices.map(item => <option key={item.id} value={item.id}>{item.code} · {item.displayName} ({item.unit}){item.isActive === false ? " — inactive" : ""}</option>)}</select></label>
                <label className="text-sm">Received ({product?.unit ?? "unit"})<input type="number" min={product?.unit === "PCS" || product?.unit === "BOX" ? "1" : "0.001"} step={product?.unit === "PCS" || product?.unit === "BOX" ? "1" : "0.001"} required value={line.quantity} disabled={busy} className={input} onChange={event => setLines(values => values.map((value, position) => position === index ? { ...value, quantity: event.target.value } : value))} /></label>
                <button type="button" className={secondary} disabled={busy || lines.length === 1} onClick={() => setLines(values => values.filter((_, position) => position !== index))}>Remove row</button></div>; })}</div>
            {error && <p role="alert" className="mt-3 rounded bg-red-100 p-3 text-red-800">{error}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className={secondary} disabled={busy || lines.length >= 200} onClick={() => setLines(values => [...values, { productId: "", quantity: "" }])}>Add product</button><button type="submit" className={primary} disabled={busy || !choices.length || (!!receipt && !dirty)}>{busy ? "Saving…" : "Save draft"}</button>
                <button type="button" className={secondary} disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard these unsaved changes?")) onClose(); }}>Close draft</button>{dirty && <span className="text-sm text-amber-900">Unsaved changes</span>}</div>
        </form>
    </section>;
}
function ReceiptPanel({ receipt, token, actor, products, onClose, onChanged }: { receipt: Receipt; token: string; actor: Actor; products: Product[]; onClose: () => void; onChanged: (receipt: Receipt, text: string) => void }) {
    const [editing, setEditing] = useState(false), [confirming, setConfirming] = useState(false), [reversing, setReversing] = useState(false);
    const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const sending = useRef(false);
    const ownDraft = receipt.sourceType === "MANUAL_RECEIPT" && receipt.status === "DRAFT" && actor.roleCode === "INV" && receipt.createdById === actor.userId && receipt.branchId === actor.branchId;
    async function post(action: "confirm" | "reverse") {
        if (sending.current) return;
        sending.current = true; setBusy(true); setError(null);
        try { const result = await api<Receipt>(`/api/stock/receipts/${receipt.id}/${action}`, token, "POST", { version: receipt.version, ...(action === "reverse" ? { reason } : {}) }); onChanged(result, action === "confirm" ? "Receipt confirmed. Stock was increased exactly once." : "Receipt reversed. Opposite stock movements were recorded."); }
        catch (err) { setError(err instanceof Error ? err.message : "Receipt could not be posted."); }
        finally { sending.current = false; setBusy(false); }
    }
    if (editing) return <ReceiptEditor receipt={receipt} token={token} products={products} onClose={() => setEditing(false)} onSaved={value => onChanged(value, "Draft updated. Stock has not changed.")} />;
    return <section className="my-4 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm sm:p-6" aria-label="Receipt details">
        <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{sourceName(receipt.sourceType)} · {receipt.status}</h2><p className="mt-1 break-all font-mono text-xs text-stone-500">{receipt.id}</p></div><button type="button" disabled={busy} className={secondary} onClick={onClose}>Close receipt</button></header>
        {receipt.sourceRequestId && <p className="mt-3 break-all rounded-lg bg-amber-50 p-3 text-sm">Linked request: {receipt.sourceRequestId}. Stock came from final received quantities, not production. Reversal does not reopen or change that request.</p>}
        <p className="my-3 text-sm">{receipt.branch.code} · Business date {receipt.businessDate.slice(0, 10)} · Created by {receipt.createdBy.username} · Revision {receipt.version}</p>{receipt.note && <p className="mb-3 whitespace-pre-wrap text-sm text-stone-600">{receipt.note}</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f7efe3]"><tr><th className="p-3">Product</th><th className="p-3">Quantity</th><th className="p-3">Unit</th></tr></thead><tbody>{receipt.lines.map(line => <tr key={line.productId} className="border-t"><td className="p-3">{line.product.code} · {line.product.displayName}</td><td className="p-3 font-semibold">{String(line.quantity)}</td><td className="p-3">{line.product.unit}</td></tr>)}</tbody></table></div>
        {receipt.confirmedAt && <p className="mt-3 text-sm text-green-900">Confirmed by {receipt.confirmedBy?.username} · {new Date(receipt.confirmedAt).toLocaleString()}</p>}{receipt.reversedAt && <p className="mt-3 text-sm text-red-800">Reversed by {receipt.reversedBy?.username} · {new Date(receipt.reversedAt).toLocaleString()} · {receipt.reversalReason}</p>}
        {error && <p role="alert" className="mt-3 rounded bg-red-100 p-3 text-red-800">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-3">{ownDraft && !confirming && <><button type="button" className={secondary} onClick={() => setEditing(true)}>Edit draft</button><button type="button" className={primary} onClick={() => setConfirming(true)}>Confirm receipt</button></>}
            {receipt.status === "CONFIRMED" && actor.roleCode === "BM" && actor.branchId === receipt.branchId && !reversing && <button type="button" className={secondary} onClick={() => setReversing(true)}>Reverse receipt</button>}</div>
        {confirming && <div className="mt-4 rounded-xl bg-amber-50 p-4"><p className="text-sm">Post these received quantities to branch stock? The confirmed draft cannot be edited.</p><div className="mt-3 flex gap-3"><button type="button" className={primary} disabled={busy} onClick={() => { void post("confirm"); }}>{busy ? "Posting…" : "Yes, post receipt"}</button><button type="button" className={secondary} disabled={busy} onClick={() => setConfirming(false)}>Keep draft</button></div></div>}
        {reversing && <form className="mt-4 rounded-xl bg-red-50 p-4" onSubmit={event => { event.preventDefault(); void post("reverse"); }}><label className="text-sm">Reason for full reversal<input required minLength={5} maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className={input} /></label><p className="mt-2 text-sm">This records opposite movements and retains the original receipt. It cannot be undone; create a new receipt for corrected quantities.</p><div className="mt-3 flex gap-3"><button type="submit" className={primary} disabled={busy || reason.trim().length < 5}>{busy ? "Reversing…" : "Confirm reversal"}</button><button type="button" className={secondary} disabled={busy} onClick={() => setReversing(false)}>Keep receipt</button></div></form>}
    </section>;
}
