"use client";

import { useEffect, useState } from "react";

type Branch = { id: string; code: string; name: string; isActive: boolean };
type Totals = { unit: string; productCount: number; total: string; branchQuantities: Record<string, string> };
type Sheet = { items: { id: string; code: string; displayName: string; unit: string; isActive: boolean; branchQuantities: Record<string, string>; total: string }[];
    branches: Branch[]; branchOptions: Branch[]; page: number; pageSize: number; totalProducts: number; productsWithStock: number; unitTotals: Totals[] };
function quantity(value: string) {
    const [whole, fraction = ""] = value.split("."), trimmed = fraction.replace(/0+$/, "");
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (trimmed ? `.${trimmed}` : "");
}
export default function AdminBalanceSheet({ token, productId, refresh }: { token: string; productId: string; refresh: number }) {
    const [branchId, setBranchId] = useState(""), [pagination, setPagination] = useState({ productId, page: 1 });
    const page = pagination.productId === productId ? pagination.page : 1;
    const [state, setState] = useState<{ key: string; data?: Sheet; error?: string }>({ key: "" });
    const query = new URLSearchParams({ page: String(page) });
    if (branchId) query.set("branchId", branchId); if (productId) query.set("productId", productId);
    const queryText = query.toString(), key = `${queryText}:${refresh}`;
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/admin/stock-balances?${queryText}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal })
            .then(async response => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Balance sheet could not be loaded."); return body.data as Sheet; })
            .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
            .catch((error: unknown) => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : "Balance sheet could not be loaded." }); });
        return () => controller.abort();
    }, [token, queryText, key]);
    if (state.key !== key) return <p role="status" className="p-4">Loading branch balance sheet…</p>;
    if (state.error || !state.data) return <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{state.error ?? "No balance data available."} Use Refresh to retry.</p>;
    const data = state.data;
    const first = data.items.length ? (page - 1) * data.pageSize + 1 : 0, last = data.items.length ? first + data.items.length - 1 : 0;
    return <section aria-label="Sales branch balance sheet">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[#fcf8f2] p-4"><p className="text-xs text-stone-600">Products matching filters</p><strong className="mt-1 block text-2xl">{data.totalProducts}</strong></div>
            <div className="rounded-xl bg-[#fcf8f2] p-4"><p className="text-xs text-stone-600">Products with stock</p><strong className="mt-1 block text-2xl">{data.productsWithStock}</strong></div>
            <div className="rounded-xl bg-[#fcf8f2] p-4"><p className="text-xs text-stone-600">Sales branches shown</p><strong className="mt-1 block text-2xl">{data.branches.length}</strong></div>
        </div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><label className="text-sm">Sales branches<select value={branchId} onChange={event => { setBranchId(event.target.value); setPagination({ productId, page: 1 }); }} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"><option value="">All sales branches</option>{data.branchOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}{branch.isActive ? "" : " (inactive)"}</option>)}</select></label><p className="max-w-xl text-xs text-stone-600">Product totals sum the visible sales branches. Grand totals cover every matching product across all pages, separated by unit. Products without a ledger entry show zero.</p></div>
        <div className="overflow-x-auto rounded-xl border border-stone-200"><table className="w-full text-left text-sm"><caption className="sr-only">One product per row, one quantity column per sales branch, and a total for that product.</caption><thead className="bg-[#f7efe3]"><tr><th scope="col" className="sticky left-0 z-10 min-w-48 bg-[#f7efe3] p-3">Product</th><th scope="col" className="p-3">Unit</th>{data.branches.map(branch => <th key={branch.id} scope="col" className="min-w-32 p-3 text-right"><span className="block">{branch.code}</span><span className="mt-1 block text-xs font-normal">{branch.name}{branch.isActive ? "" : " · inactive"}</span></th>)}<th scope="col" className="min-w-32 bg-amber-100 p-3 text-right">Product total</th></tr></thead>
            <tbody>{data.items.map(product => <tr key={product.id} className="border-t"><th scope="row" className="sticky left-0 bg-white p-3 font-medium"><span className="block">{product.displayName}</span><span className="mt-1 block text-xs font-normal text-stone-500">{product.code}{product.isActive ? "" : " · inactive"}</span></th><td className="p-3 text-xs text-stone-600">{product.unit}</td>{data.branches.map(branch => <td key={branch.id} className="p-3 text-right tabular-nums">{quantity(product.branchQuantities[branch.id])}</td>)}<td className="bg-amber-50 p-3 text-right font-semibold tabular-nums">{quantity(product.total)}</td></tr>)}</tbody>
            <tfoot className="border-t-2 border-stone-300 bg-[#fcf8f2]">{data.unitTotals.map(total => <tr key={total.unit}><th scope="row" className="sticky left-0 bg-[#fcf8f2] p-3 font-semibold">Grand total · {total.unit}<span className="mt-1 block text-xs font-normal">{total.productCount} products · all pages</span></th><td className="p-3 text-xs">{total.unit}</td>{data.branches.map(branch => <td key={branch.id} className="p-3 text-right font-semibold tabular-nums">{quantity(total.branchQuantities[branch.id])}</td>)}<td className="bg-amber-100 p-3 text-right font-bold tabular-nums">{quantity(total.total)}</td></tr>)}</tfoot>
        </table>{!data.items.length && <p className="p-4 text-sm text-stone-600">No products on this page.</p>}</div>
        {!data.branches.length && <p className="mt-3 text-sm text-stone-600">No sales branches are configured.</p>}
        <nav aria-label="Balance sheet pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span>Showing {first}–{last} of {data.totalProducts} products · Page {page}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPagination({ productId, page: page - 1 })} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button><button type="button" disabled={page * data.pageSize >= data.totalProducts} onClick={() => setPagination({ productId, page: page + 1 })} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next</button></div></nav>
    </section>;
}
