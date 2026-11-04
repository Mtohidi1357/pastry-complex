"use client";

import NextImage from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStoredValue } from "@/hooks/useStoredValue";
import Sidebar from "@/components/layout/Sidebar";

type Category = { id: string; code: string; displayName: string; isActive: boolean };
type Product = { id: string; code: string; name: string; displayName: string; unit: string; categoryId: string; category: Category;
    isActive: boolean; barcode: string | null; notes: string | null; productionOrder: number; sortOrder: number; catalogVersion: number;
    image: { updatedAt: string } | null; events?: { id: string; message: string; createdAt: string; actor: { username: string } }[] };
type Listing = { items: Product[]; totalItems: number; pageSize: number };
const field = "mt-1 block w-full rounded-lg border border-[#d9c7b1] bg-white px-3 py-2 text-sm text-[#39291f] focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100 disabled:text-stone-500";
const primary = "rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-950 disabled:opacity-50";
const secondary = "rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-50";
async function api<T>(url: string, token: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { method, signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error?.message ?? "Catalog operation failed."); return result.data;
}
function Picture({ product, preview }: { product?: Product; preview?: string | null }) {
    const src = preview || (product?.image ? `/api/catalog/products/${product.id}/image?v=${product.catalogVersion}` : null);
    return src ? <NextImage src={src} alt={preview ? "Selected product photo preview" : product?.displayName ?? "Product photo"} width={640} height={480} unoptimized className="aspect-[4/3] w-full rounded-xl bg-stone-50 object-cover" /> :
        <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[#f7efe3] text-stone-500"><div className="text-center"><svg className="mx-auto mb-2 h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4" /><circle cx="15.5" cy="8.5" r="1" /></svg><span className="text-xs">No photo yet</span></div></div>;
}
export default function ProductWorkspace() {
    const token = useStoredValue("token") ?? "";
    if (!token) return <p>Please <Link href="/login" className="underline">sign in</Link> as an administrator.</p>;
    return <CatalogView key={token} token={token} />;
}
function CatalogView({ token }: { token: string }) {
    const [menu, setMenu] = useState(false), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [query, setQuery] = useState("");
    const [includeInactive, setIncludeInactive] = useState(false), [category, setCategory] = useState("");
    const [categories, setCategories] = useState<Category[]>([]), [optionError, setOptionError] = useState<string | null>(null);
    const [listing, setListing] = useState<Listing | null>(null), [loading, setLoading] = useState(true), [opening, setOpening] = useState(false);
    const [selected, setSelected] = useState<Product | null>(null), [creating, setCreating] = useState(false), [addingCategory, setAddingCategory] = useState(false);
    const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null), generation = useRef(0);
    useEffect(() => {
        const controller = new AbortController();
        api<Category[]>("/api/catalog/options", token, "GET", undefined, controller.signal).then(value => { if (!controller.signal.aborted) { setCategories(value); setOptionError(null); } }).catch((err: unknown) => { if (!controller.signal.aborted) setOptionError(err instanceof Error ? err.message : "Categories could not be loaded."); });
        return () => controller.abort();
    }, [token, refresh]);
    useEffect(() => {
        const controller = new AbortController(), params = new URLSearchParams({ page: String(page), includeInactive: String(includeInactive) });
        if (category) params.set("categoryId", category); if (query) params.set("q", query);
        let relocated = false;
        api<Listing>(`/api/catalog/products?${params}`, token, "GET", undefined, controller.signal).then(value => {
            if (controller.signal.aborted) return;
            const last = Math.max(1, Math.ceil(value.totalItems / value.pageSize));
            if (page > last) { relocated = true; setPage(last); return; }
            setListing(value); setError(null);
        }).catch((err: unknown) => { if (!controller.signal.aborted) { setListing(null); setError(err instanceof Error ? err.message : "Catalog could not be loaded."); } }).finally(() => { if (!controller.signal.aborted && !relocated) setLoading(false); });
        return () => controller.abort();
    }, [token, page, includeInactive, category, query, refresh]);
    async function open(id: string) {
        const current = ++generation.current; setOpening(true); setError(null); setMessage(null);
        try { const result = await api<Product>(`/api/catalog/products/${id}`, token); if (current === generation.current) setSelected(result); }
        catch (err) { if (current === generation.current) setError(err instanceof Error ? err.message : "Product could not be opened."); }
        finally { if (current === generation.current) setOpening(false); }
    }
    async function changed(product: Product, text: string) {
        const current = ++generation.current;
        setCreating(false); setSelected(product); setMessage(text); setLoading(true); setRefresh(value => value + 1);
        try { const result = await api<Product>(`/api/catalog/products/${product.id}`, token); if (current === generation.current) setSelected(result); }
        catch { if (current === generation.current) setError("Product was saved. Close and reopen it to reload its history."); }
    }
    function close() { generation.current++; setSelected(null); setCreating(false); setOpening(false); }
    function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = new FormData(event.currentTarget).get("search"); setQuery(typeof value === "string" ? value.trim() : ""); setPage(1); setLoading(true); setRefresh(value => value + 1); }
    const locked = creating || !!selected || opening || addingCategory;
    return <div className="min-h-screen bg-[#faf5ed] text-[#39291f]"><Sidebar isOpen={menu} onClose={() => setMenu(false)} /><main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:pl-28">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><button type="button" onClick={() => setMenu(true)} className={`${secondary} mb-2 lg:hidden`}>Menu</button><p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Administration · Catalog</p><h1 className="mt-1 text-2xl font-semibold">Products</h1><p className="mt-1 text-sm text-stone-600">Product details, availability, units and pictures.</p></div><div className="flex flex-wrap gap-3"><button type="button" disabled={loading} className={secondary} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Refresh</button><button type="button" disabled={locked} className={secondary} onClick={() => setAddingCategory(true)}>Add category</button><button type="button" disabled={locked} className={primary} onClick={() => { setCreating(true); setMessage(null); }}>Add product</button></div></header>
        {(error || optionError) && <p role="alert" className="mb-4 rounded bg-red-100 p-3 text-red-800">{error ?? optionError}</p>}{message && <p role="status" className="mb-4 rounded bg-green-100 p-3 text-green-900">{message}</p>}
        {addingCategory && <CategoryForm token={token} onClose={() => setAddingCategory(false)} onCreated={() => { setAddingCategory(false); setMessage("Category added."); setRefresh(value => value + 1); }} />}
        {(creating || selected) && <ProductEditor key={selected ? `${selected.id}:${selected.catalogVersion}` : "new"} token={token} product={selected ?? undefined} categories={categories} onClose={close} onSaved={changed} />}
        {opening && <p role="status">Opening product…</p>}
        <section className="mt-5 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm"><div className="mb-4 flex flex-wrap items-end gap-4"><form onSubmit={search} className="flex min-w-0 flex-1 gap-2"><label className="min-w-0 flex-1 text-sm">Search<input name="search" placeholder="Code, name or barcode" disabled={locked} maxLength={100} className={field} /></label><button type="submit" disabled={locked} className={`${secondary} self-end`}>Search</button></form><label className="text-sm">Category<select value={category} disabled={locked} className={field} onChange={event => { setCategory(event.target.value); setPage(1); setLoading(true); }}><option value="">All categories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.displayName}{item.isActive ? "" : " · inactive"}</option>)}</select></label><label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={includeInactive} disabled={locked} onChange={event => { setIncludeInactive(event.target.checked); setPage(1); setLoading(true); }} />Show inactive products</label></div>
            {loading ? <p role="status">Loading products…</p> : listing && <><p className="mb-4 text-sm text-stone-600">{listing.totalItems} matching products</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{listing.items.map(product => <article key={product.id} className="min-w-0 rounded-xl border border-stone-200 p-3"><Picture product={product} /><div className="mt-3 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-amber-900">{product.code}</p><h2 className="mt-1 font-semibold">{product.displayName}</h2></div><span className={`rounded-full px-2 py-1 text-xs ${product.isActive ? "bg-green-100 text-green-900" : "bg-stone-100 text-stone-600"}`}>{product.isActive ? "Active" : "Inactive"}</span></div><p className="mt-2 text-sm text-stone-600">{product.category.displayName} · {product.unit}</p><button type="button" disabled={locked} className={`${secondary} mt-3 w-full`} onClick={() => { void open(product.id); }}>Manage product</button></article>)}</div>{!listing.items.length && <p className="py-6 text-sm text-stone-600">No products match these filters.</p>}<nav aria-label="Product pages" className="mt-5 flex items-center justify-between gap-3 text-sm"><span>Page {page} · {listing.totalItems} products</span><div className="flex gap-2"><button type="button" disabled={locked || page <= 1} className={secondary} onClick={() => { setPage(page - 1); setLoading(true); }}>Previous</button><button type="button" disabled={locked || page * listing.pageSize >= listing.totalItems} className={secondary} onClick={() => { setPage(page + 1); setLoading(true); }}>Next</button></div></nav></>}
        </section>
    </main></div>;
}
function ProductEditor({ token, product, categories, onClose, onSaved }: { token: string; product?: Product; categories: Category[]; onClose: () => void; onSaved: (product: Product, text: string) => Promise<void> }) {
    const [values, setValues] = useState(() => ({ code: product?.code ?? "", name: product?.name ?? "", displayName: product?.displayName ?? "", categoryId: product?.categoryId ?? "", unit: product?.unit ?? "PCS", barcode: product?.barcode ?? "", notes: product?.notes ?? "", productionOrder: product?.productionOrder ?? 0, sortOrder: product?.sortOrder ?? 0, isActive: product?.isActive ?? true }));
    const [initial] = useState(() => JSON.stringify(values)), [busy, setBusy] = useState(false), [photoLocked, setPhotoLocked] = useState(false), [error, setError] = useState<string | null>(null); const sending = useRef(false);
    const dirty = JSON.stringify(values) !== initial;
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); if (sending.current) return; sending.current = true; setBusy(true); setError(null);
        try { const result = await api<Product>(`/api/catalog/products${product ? `/${product.id}` : ""}`, token, product ? "PATCH" : "POST", { ...values, ...(product ? { version: product.catalogVersion } : {}) }); await onSaved(result, product ? "Product updated. Existing stock quantities are unchanged." : "Product created. You can now add its photo or use it in receiving and counts."); }
        catch (err) { setError(err instanceof Error ? err.message : "Product could not be saved."); }
        finally { sending.current = false; setBusy(false); }
    }
    const disabled = busy || photoLocked;
    return <section className="my-4 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm sm:p-6" aria-label="Product editor"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{product ? `${product.code} · ${product.displayName}` : "Add a product"}</h2><p className="mt-1 text-sm text-stone-600">Code and unit are fixed after creation. Deactivate products instead of deleting stock history.</p></div><button type="button" disabled={disabled} className={secondary} onClick={() => { if (!dirty || window.confirm("Discard unsaved product changes?")) onClose(); }}>Close product</button></div>
        <form onSubmit={save} className="mt-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm">Product code<input required maxLength={product ? 191 : 40} value={values.code} disabled={disabled || !!product} className={field} placeholder="e.g. P012" onChange={event => setValues(value => ({ ...value, code: event.target.value.toUpperCase() }))} /></label><label className="text-sm">Name<input required maxLength={191} value={values.name} disabled={disabled} className={field} onChange={event => setValues(value => ({ ...value, name: event.target.value }))} /></label><label className="text-sm">Display name<input required maxLength={191} value={values.displayName} disabled={disabled} className={field} onChange={event => setValues(value => ({ ...value, displayName: event.target.value }))} /></label><label className="text-sm">Category<select required value={values.categoryId} disabled={disabled} className={field} onChange={event => setValues(value => ({ ...value, categoryId: event.target.value }))}><option value="">Choose category</option>{categories.map(item => <option key={item.id} value={item.id} disabled={!item.isActive && item.id !== product?.categoryId}>{item.displayName}{item.isActive ? "" : " · inactive"}</option>)}</select></label><label className="text-sm">Unit<select value={values.unit} disabled={disabled || !!product} className={field} onChange={event => setValues(value => ({ ...value, unit: event.target.value }))}>{["PCS", "KG", "GR", "LITER", "BOX"].map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label><label className="text-sm">Barcode (optional)<input value={values.barcode} maxLength={191} disabled={disabled} className={field} onChange={event => setValues(value => ({ ...value, barcode: event.target.value }))} /></label><label className="text-sm">Production order<input type="number" required min="0" max="1000000" step="1" value={values.productionOrder} disabled={disabled} className={field} onChange={event => setValues(value => ({ ...value, productionOrder: Number(event.target.value) }))} /></label><label className="text-sm">Display order<input type="number" required min="0" max="1000000" step="1" value={values.sortOrder} disabled={disabled} className={field} onChange={event => setValues(value => ({ ...value, sortOrder: Number(event.target.value) }))} /></label><label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={values.isActive} disabled={disabled} onChange={event => setValues(value => ({ ...value, isActive: event.target.checked }))} />Active product</label></div><label className="mt-4 block text-sm">Notes (optional)<textarea value={values.notes} maxLength={191} disabled={disabled} className={field} onChange={event => setValues(value => ({ ...value, notes: event.target.value }))} /></label><p className="mt-2 text-xs text-stone-600">Inactive products are excluded from new request/receipt selection. Existing documents and stock remain intact.</p>{error && <p role="alert" className="mt-3 rounded bg-red-100 p-3 text-red-800">{error}</p>}<button type="submit" disabled={disabled || (!!product && !dirty)} className={`${primary} mt-4`}>{busy ? "Saving…" : product ? "Save product" : "Create product"}</button></form>
        {photoLocked && <p className="mt-3 text-sm text-amber-900">Finish or cancel photo selection before editing product fields.</p>}
        {product ? <PhotoPanel key={`${product.id}:${product.catalogVersion}`} product={product} token={token} disabled={dirty || busy} onLock={setPhotoLocked} onSaved={onSaved} /> : <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm">Save the new product first, then add its photo.</p>}
        {product && <section className="mt-6"><h3 className="font-semibold">Recent catalog history</h3>{product.events?.length ? <ul className="mt-3 space-y-2">{product.events.map(item => <li key={item.id} className="rounded-lg bg-stone-50 p-3 text-sm"><strong>{item.actor.username}</strong> · {new Date(item.createdAt).toLocaleString()}<p className="mt-1 text-stone-600">{item.message}</p></li>)}</ul> : <p className="mt-2 text-sm text-stone-500">No recent catalog changes recorded.</p>}</section>}
    </section>;
}
async function resizePhoto(file: File): Promise<Blob> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choose a JPEG, PNG or WebP photo up to 10 MB.");
    const url = URL.createObjectURL(file), picture = new window.Image();
    try {
        picture.src = url; await picture.decode();
        if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth * picture.naturalHeight > 40_000_000) throw new Error("Choose a smaller product photo.");
        const scale = Math.min(1, 1200 / Math.max(picture.naturalWidth, picture.naturalHeight)), canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
        const context = canvas.getContext("2d"); if (!context) throw new Error("This browser cannot prepare a photo.");
        context.drawImage(picture, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Photo could not be prepared.")), "image/webp", 0.85));
        if (blob.size > 2 * 1024 * 1024) throw new Error("Prepared photo is still too large. Choose a smaller image.");
        return blob;
    } finally { URL.revokeObjectURL(url); }
}
function PhotoPanel({ product, token, disabled, onLock, onSaved }: { product: Product; token: string; disabled: boolean; onLock: (value: boolean) => void; onSaved: (product: Product, text: string) => Promise<void> }) {
    const [blob, setBlob] = useState<Blob | null>(null), [preview, setPreview] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const sending = useRef(false), previewRef = useRef<string | null>(null);
    useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
    function clear() { if (previewRef.current) URL.revokeObjectURL(previewRef.current); previewRef.current = null; setPreview(null); setBlob(null); setError(null); onLock(false); }
    async function choose(file?: File) {
        if (!file || sending.current) return; sending.current = true; setBusy(true); setError(null); onLock(true);
        try { const prepared = await resizePhoto(file); if (previewRef.current) URL.revokeObjectURL(previewRef.current); previewRef.current = URL.createObjectURL(prepared); setBlob(prepared); setPreview(previewRef.current); }
        catch (err) { setError(err instanceof Error ? err.message : "Photo could not be prepared."); onLock(!!blob); }
        finally { sending.current = false; setBusy(false); }
    }
    async function change(remove = false) {
        if (sending.current) return; if (remove && !window.confirm("Remove this product photo?")) return;
        sending.current = true; setBusy(true); setError(null); onLock(true);
        try {
            let body: FormData | { version: number };
            if (remove) body = { version: product.catalogVersion };
            else { if (!blob) throw new Error("Choose a photo first."); body = new FormData(); body.set("version", String(product.catalogVersion)); body.set("file", blob, blob.type === "image/png" ? "product.png" : "product.webp"); }
            const result = await api<Product>(`/api/catalog/products/${product.id}/image`, token, remove ? "DELETE" : "POST", body);
            await onSaved(result, remove ? "Product photo removed." : "Product photo saved.");
        } catch (err) { setError(err instanceof Error ? err.message : "Photo could not be saved."); if (!blob) onLock(false); }
        finally { sending.current = false; setBusy(false); }
    }
    return <section className="mt-6 border-t border-stone-200 pt-5" aria-label="Product photo"><h3 className="font-semibold">Product photo</h3><div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]"><Picture product={product} preview={preview} /><div><p className="mb-3 text-sm text-stone-600">JPEG, PNG or WebP. Photos are resized automatically for a faster catalog. Maximum stored size: 2 MB.</p><label className="block text-sm">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} className="mt-2 block w-full text-sm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void choose(file); }} /></label>{disabled && <p className="mt-2 text-xs text-amber-900">Save or discard product field changes before changing the photo.</p>}<div className="mt-4 flex flex-wrap gap-3">{blob && <><button type="button" className={primary} disabled={disabled || busy} onClick={() => { void change(); }}>{busy ? "Uploading…" : "Save photo"}</button><button type="button" className={secondary} disabled={busy} onClick={clear}>Cancel photo selection</button></>}{product.image && !blob && <button type="button" className={secondary} disabled={disabled || busy} onClick={() => { void change(true); }}>Remove photo</button>}</div>{busy && <p role="status" className="mt-2 text-sm text-stone-600">Preparing or saving photo…</p>}{error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}</div></div></section>;
}
function CategoryForm({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: () => void }) {
    const [code, setCode] = useState(""), [name, setName] = useState(""), [displayName, setDisplayName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null); const sending = useRef(false);
    async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (sending.current) return; sending.current = true; setBusy(true); setError(null); try { await api("/api/catalog/categories", token, "POST", { code, name, displayName }); onCreated(); } catch (err) { setError(err instanceof Error ? err.message : "Category could not be added."); } finally { sending.current = false; setBusy(false); } }
    return <section className="mb-4 rounded-xl border border-[#eadcc9] bg-white p-4"><h2 className="font-semibold">Add a category</h2><form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-sm">Code<input required maxLength={40} value={code} disabled={busy} className={field} onChange={event => setCode(event.target.value.toUpperCase())} /></label><label className="text-sm">Name<input required maxLength={191} value={name} disabled={busy} className={field} onChange={event => setName(event.target.value)} /></label><label className="text-sm">Display name<input required maxLength={191} value={displayName} disabled={busy} className={field} onChange={event => setDisplayName(event.target.value)} /></label><div className="flex gap-3 sm:col-span-3"><button type="submit" disabled={busy} className={primary}>Save category</button><button type="button" disabled={busy} className={secondary} onClick={onClose}>Cancel</button></div>{error && <p role="alert" className="text-sm text-red-800 sm:col-span-3">{error}</p>}</form></section>;
}
