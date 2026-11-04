"use client";
import CountTaskQueue from "./CountTaskQueue";
import { WasteTaskQueue } from "../waste/WasteWorkspace";
import { trackingCode } from "@/lib/trackingCode";
import styles from "./InboxTheme.module.css";
import InventoryPanel from "../dailyRequest/InventoryPanel";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RequestCapabilities } from "../requestPolicy/requestCapabilities";
import { WorkflowAction } from "../workflow/wrokFlowDefinition";
import InventoryForm from "../dailyRequest/components/InventoryForm";
import RequestedQuantityForm from "../dailyRequest/components/RequestQuantityForm";
import ProductionForm from "../dailyRequest/components/ProductionForm";
import { RequestStatus } from "@/generated/prisma/enums";
import ReceivingForm from "../dailyRequest/components/ReceivingForm";
import Sidebar from "@/components/layout/Sidebar";
import { canCreateRequests } from "../dailyRequest/requestCreationPolicy";
import { LoggedInUser } from "../auth/authTypes";
import { useStoredValue } from "@/hooks/useStoredValue";
import DeleteRequestForm from "../dailyRequest/DeleteRequestForm";
import CancelRequestForm from "../dailyRequest/CancelRequestForm";
import RequestEditSession from "../dailyRequest/RequestEditSession";
type InventoryLine = {
    id: string;
    product: {
        id: string;
        displayName: string;
    };
    previousBalance: number;
    currentBalance: number;
    requestedQty: number | null;
};
type WorkItem = {
    trackingNumber?: number;
    id: string;
    businessDate: string | null;
    status: RequestStatus;
    branchId: string;
    salesBranchName: string;
    createdById: string;
    submittedAt: string | null;
    approvedAt: string | null;
    completedAt: string | null;
    reportedAt: string | null;
    createdAt: string;
    updatedAt: string;
    assignedToId: string | null;
    lastActionAt: string | null;
    deletedAt: string | null;
    deletedById: string | null;
    cancelledAt: string | null;
    capabilities: RequestCapabilities;
    lines: InventoryLine[]
};
function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
}
const STATUS_COLORS: Record<string, string> = {
    WORKSHOP_PROCESSING: "bg-amber-50 text-amber-800 border-amber-200",
    DRAFT: "bg-emerald-50 text-emerald-800 border-emerald-200",
    INVENTORY_SUBMITTED: "bg-sky-50 text-sky-800 border-sky-200",
    MANAGER_SUBMITTED: "bg-violet-50 text-violet-800 border-violet-200",
    COMPLETED: "bg-blue-50 text-blue-800 border-blue-200",
    CLOSED: "bg-slate-100 text-slate-700 border-slate-200",
    CANCELLED: "bg-red-50 text-red-800 border-red-200",
};
async function fetchInboxData(
    token: string,
    showFinished: boolean,
    page: number,
    signal?: AbortSignal,
) {
    const query = new URLSearchParams({ showFinished: String(showFinished), page: String(page), pageSize: "20" });
    const res = await fetch(`/api/dashboard/inbox?${query}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        signal,
    });
    if(!res.ok) {
        throw new Error("Failed to load inbox.")
    }

    const response = await res.json();
    return response.data;
}
export default function InboxForm() {
    // const [token, setToken] = useState("");
    // const [user, setUser] = useState<LoggedInUser | null>(null);
    const token = useStoredValue("token") ?? "";
    const storedUser = useStoredValue("user");
    let user: LoggedInUser | null = null;
    if (storedUser) {
        try {
            user = JSON.parse(storedUser) as LoggedInUser;
        } catch {
            //Ignore invalid stored user data.
        }
    }
    const [countEditorOpen, setCountEditorOpen] = useState(false);
    const [wasteEditorOpen, setWasteEditorOpen] = useState(false);
    const [countRefresh, setCountRefresh] = useState(0);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showFinished, setShowFinished] = useState(false);
    const [inboxPage, setInboxPage] = useState(1);
    const listGeneration = useRef(0);
    const [inbox, setInbox] = useState<WorkItem[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [fetching, setLoading] = useState(true);
    const loading = Boolean(token) && fetching;
    const [error, setError] = useState<string | null>(null);
    const [selectedRequestId, setSelectedRequestId] =
        useState<string | null>(null);
    const [workFlowAction, setWorkFlowAction] = useState<WorkflowAction | null>(null);
    const router = useRouter();
    const handleSubformClose = async () => {
        setSelectedRequestId(null);
        setWorkFlowAction(null);
        await loadInbox();
    };

// Refresh after a button click or workflow action.
const loadInbox = async () => {
    if (!token) return;
    const generation = ++listGeneration.current;
    setLoading(true);
    setError(null);
    try {
        const data = await fetchInboxData(token, showFinished, inboxPage);
        if (generation !== listGeneration.current) return;
        const lastPage = Math.max(1, Math.ceil(data.totalItems / 20));
        if (inboxPage > lastPage) { listGeneration.current++; setInboxPage(lastPage); return; }
        setInbox(data.items);
        setTotalItems(data.totalItems);
    } catch (err) {
        if (generation !== listGeneration.current) return;
        setError(
            err instanceof Error
                ? err.message
                : "Failed to load inbox."
        );
    } finally {
        if (generation === listGeneration.current) setLoading(false);
    }
};
// Initial load: update state in the network completion callbacks.
useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const { signal } = controller;
    const generation = ++listGeneration.current;

    fetchInboxData(token, showFinished, inboxPage, signal)
        .then((data) => {
            if (signal.aborted || generation !== listGeneration.current) return;
            const lastPage = Math.max(1, Math.ceil(data.totalItems / 20));
            if (inboxPage > lastPage) { listGeneration.current++; setInboxPage(lastPage); return; }
            setInbox(data.items);
            setTotalItems(data.totalItems);
            setError(null);
        })
        .catch((err: unknown) => {
            if (signal.aborted || generation !== listGeneration.current) return;
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load inbox."
            );
        })
        .finally(() => {
            if (!signal.aborted && generation === listGeneration.current) {
                setLoading(false);
            }
        });
    return () => controller.abort();
}, [token, showFinished, inboxPage]);
    const handleRequestDetail = async (
        requestId: string,
        action: WorkflowAction
    ) => {
        if (countEditorOpen || wasteEditorOpen) return;
        setSelectedRequestId(requestId);
        setWorkFlowAction(action);
    };
    const handleProductionOpen = (requestId: string, status: RequestStatus) => {
        if (countEditorOpen || wasteEditorOpen) return;
        if (status !== RequestStatus.MANAGER_SUBMITTED && status !== RequestStatus.WORKSHOP_PROCESSING) {
            setError("This request is not available for production.");
            return;
        }
        setError(null);
        setSelectedRequestId(requestId);
        setWorkFlowAction(WorkflowAction.START_PRODUCTION);
    };
    return (
        <div className={`min-h-screen w-full min-w-0 ${styles.canvas}`}>
            <div>
            {/* Sidebar */}
            <Sidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />
            </div>
            <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-[1600px] flex-col px-4 py-6 sm:px-6 lg:pl-28 lg:pr-8">
                <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setSidebarOpen(true)}
                            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 lg:hidden" aria-label="Open navigation">
                            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <div><p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Branch operations</p>
                            <h1 className="mt-1 text-2xl font-semibold text-[#39291f]">Your Inbox</h1>
                            <p className="mt-1 text-sm text-slate-600">{user?.role?.code === "BM" ? "Daily requests assigned to you, plus stock counts and waste cases awaiting your branch’s approval." : "Requests assigned to you, ready for the next step."}</p></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button type="button" disabled={loading || !token || countEditorOpen || wasteEditorOpen || selectedRequestId !== null} onClick={() => { setCountRefresh(value => value + 1); void loadInbox(); }}
                            className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Refresh inbox</button>
                        {canCreateRequests(user?.role?.code) && <button type="button" disabled={countEditorOpen || wasteEditorOpen || selectedRequestId !== null} onClick={() => router.push("/daily-request")}
                            className="min-h-10 rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-950">+ New Request</button>}
                    </div>
                </header>
                <section className={styles.banner} aria-label="Pastry workspace">
                    <div className={styles.copy}><span>A little care, in every batch</span><h2>Good things are taking shape.</h2><p>From branch inventory to the workshop, keep every request moving with care.</p></div>
                    <div className={styles.art} role="img" aria-label="Golden pastries with berries and coffee" />
                </section>
                <label className="mb-4 flex items-center gap-2 text-sm" title="Include closed/cancelled requests and finished stock-count/waste approvals. Completed requests awaiting receiving remain visible.">
                    <input type="checkbox" checked={showFinished} disabled={selectedRequestId !== null || countEditorOpen || wasteEditorOpen} onChange={event => { setShowFinished(event.target.checked); setInboxPage(1); setInbox([]); setTotalItems(0); setError(null); setLoading(true); }} />
                    Show finished items
                </label>
                {user?.role?.code === "BM" && token && <CountTaskQueue token={token} showFinished={showFinished} refresh={countRefresh} blocked={selectedRequestId !== null || wasteEditorOpen} onEditorChange={setCountEditorOpen} />}
                {user?.role?.code === "BM" && token && <WasteTaskQueue token={token} showFinished={showFinished} refresh={countRefresh} blocked={selectedRequestId !== null || countEditorOpen} onEditorChange={setWasteEditorOpen} />}
                <fieldset disabled={countEditorOpen || wasteEditorOpen} className="m-0 min-w-0 border-0 p-0">
                {user?.role?.code === "BM" && <h2 className="mb-3 text-lg font-semibold text-[#39291f]">Daily requests</h2>}
                {wasteEditorOpen && <p className="mb-3 text-sm text-amber-900">Close the waste review before opening a daily request.</p>}
                {countEditorOpen && <p className="mb-3 text-sm text-amber-900">Close the stock-count review before opening a daily request.</p>}
                {loading && <p role="status" className="mb-4 text-sm text-slate-600">Loading inbox…</p>}
                {error && (
                    <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
                )}
                {inbox.length > 0 && (
                    <>
                        <p className="mb-3 text-sm font-medium text-slate-600">
                            {totalItems} item{totalItems !== 1 ? "s" : ""}
                        </p>
                        <ul className="space-y-5">
                            {inbox.map((item) => (
                                <li
                                    key={item.id}
                                    className="min-w-0 rounded-2xl border border-[#eadcc9] bg-white p-4 shadow-sm sm:p-6"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="text-sm text-slate-600">
                                            Business date:{" "}
                                            <span className="font-semibold text-[#39291f]">
                                                {formatDate(item.businessDate)}
                                            </span>
                                        </span>
                                        <span
                                            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] ??
                                                "bg-slate-100 text-slate-700 border-slate-200"
                                                }`}
                                        >
                                            {item.status.replaceAll("_", " ")}
                                        </span>
                                    </div>
                                    <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-8 gap-y-3 rounded-xl bg-[#fcf8f2] p-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                                        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
                                            <dt className="text-xs text-slate-500">Submitted</dt>
                                            <dd className="break-words text-sm font-medium text-slate-800">
                                                {formatDate(item.submittedAt)}
                                            </dd>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
                                            <dt className="text-xs text-slate-500">Approved</dt>
                                            <dd className="break-words text-sm font-medium text-slate-800">
                                                {formatDate(item.approvedAt)}
                                            </dd>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
                                            <dt className="text-xs text-slate-500">Created</dt>
                                            <dd className="break-words text-sm font-medium text-slate-800">
                                                {formatDate(item.createdAt)}
                                            </dd>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
                                            <dt className="text-xs text-slate-500">Branch</dt>
                                            <dd className="break-words text-xs font-medium text-slate-700">
                                                {item.salesBranchName}
                                            </dd>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
                                            <dt className="text-xs text-slate-500">Last Action</dt>
                                            <dd className="break-words text-sm font-medium text-slate-800">
                                                {formatDate(item.lastActionAt)}
                                            </dd>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
                                            <dt className="text-xs text-slate-500">Updated</dt>
                                            <dd className="break-words text-xs font-medium text-slate-700">
                                                {formatDate(item.updatedAt)}
                                            </dd>
                                        </div>
                                    </dl>
                                    <p className="mt-3 font-mono text-xs font-semibold text-amber-900">{trackingCode("REQ", item)}</p>
                                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                                        {item.capabilities.canDelete && (
                                            <button type="button"
                                                onClick={() => {
                                                    if (selectedRequestId === item.id) {
                                                        setError("Close the open subform before deleting this request.");
                                                        return;
                                                    }
                                                    setError(null);
                                                    void handleRequestDetail(item.id, WorkflowAction.DELETE_REQUEST);
                                                }}
                                                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50">
                                                Delete
                                            </button>
                                        )}
                                        {/* SUBMIT_INVENTORY */}
                                        {item.capabilities.availableActions.includes(
                                            WorkflowAction.SUBMIT_INVENTORY
                                        ) && (
                                                <button
                                                    type="button"
                                                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-950"
                                                    onClick={() =>
                                                        handleRequestDetail(
                                                            item.id,
                                                            WorkflowAction.SUBMIT_INVENTORY
                                                        )
                                                    }>
                                                    Record Inventory
                                                </button>
                                            )}
                                        {/* SUBMIT_MANAGER */}
                                        {item.capabilities.availableActions.includes(
                                            WorkflowAction.SUBMIT_MANAGER
                                        ) && (
                                                <button type="button"
                                                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-950"
                                                    onClick={() =>
                                                        handleRequestDetail(
                                                            item.id,
                                                            WorkflowAction.SUBMIT_MANAGER
                                                        )
                                                    }>
                                                    Record Requested Qty
                                                </button>
                                            )}
                                        {/* START_PRODUCTION / COMPLETE_PRODUCTION */}
                                        {(item.capabilities.availableActions.includes(
                                            WorkflowAction.START_PRODUCTION
                                        ) || item.capabilities.availableActions.includes(
                                            WorkflowAction.COMPLETE_PRODUCTION
                                            )) && (
                                                <button
                                                    type="button"

                                                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                                                    onClick={() => {
                                                        void handleProductionOpen(item.id, item.status);
                                                    }}
                                                >
                                                    Record/Edit Production
                                                </button>
                                            )}
                                        {/* CLOSE_REQUEST */}
                                        {item.capabilities.availableActions.includes(
                                            WorkflowAction.CLOSE_REQUEST
                                        ) && (
                                                <button type="button"
                                                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-950"
                                                    onClick={() =>
                                                        handleRequestDetail(
                                                            item.id,
                                                            WorkflowAction.CLOSE_REQUEST
                                                        )
                                                    }>
                                                    Close
                                                </button>
                                            )}
                                        {/* CANCEL_REQUEST */}
                                        {item.capabilities.availableActions.includes(
                                            WorkflowAction.CANCEL_REQUEST
                                        ) && (
                                                <button type="button"
                                                    onClick={() => {
                                                        if (selectedRequestId === item.id) {
                                                            setError("Close the open subform before cancelling this request.");
                                                            return;
                                                        }
                                                        setError(null);
                                                        void handleRequestDetail(item.id, WorkflowAction.CANCEL_REQUEST);
                                                    }}
                                                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-950"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                    </div>
                                    {selectedRequestId === item.id && workFlowAction === WorkflowAction.DELETE_REQUEST && (
                                        <RequestEditSession key={`delete-${item.id}`} requestId={item.id} token={token}
                                            production={false}
                                            onClose={() => { void handleSubformClose(); }}>
                                            {editorToken => (
                                                <DeleteRequestForm requestId={item.id} token={token} editorToken={editorToken}
                                                    onClose={() => { void handleSubformClose(); }}
                                                    onDeleted={handleSubformClose} />
                                            )}
                                        </RequestEditSession>
                                    )}
                                    {selectedRequestId === item.id && workFlowAction === WorkflowAction.CANCEL_REQUEST && (
                                        <RequestEditSession key={`cancel-${item.id}`} requestId={item.id} token={token}
                                            production={false}
                                            onClose={() => { void handleSubformClose(); }}>
                                            {editorToken => (
                                                <CancelRequestForm requestId={item.id} token={token} editorToken={editorToken}
                                                    onClose={() => { void handleSubformClose(); }}
                                                    onCancelled={handleSubformClose} />
                                            )}
                                        </RequestEditSession>
                                    )}
                                    {selectedRequestId === item.id &&
                                        workFlowAction === WorkflowAction.SUBMIT_INVENTORY && (
                                            <div className="mt-2 mb-4">
                                                <RequestEditSession key={item.id} requestId={item.id} token={token}
                                                    production={false}
                                                    onClose={() => { void handleSubformClose(); }}>
                                                    {editorToken => (
                                                    <InventoryPanel><InventoryForm
                                                    requestId={item.id}
                                                    token={token}
                                                    editorToken={editorToken}
                                                    onClose={() => {
                                                        void handleSubformClose();
                                                    }}
                                                    onSaved={loadInbox}
                                                    onSubmitted={async () => {
                                                        setSelectedRequestId(null);
                                                        await loadInbox();
                                                    }}
                                                /></InventoryPanel>
                                                    )}
                                                </RequestEditSession>
                                            </div>)}
                                    {selectedRequestId === item.id &&
                                        workFlowAction === WorkflowAction.SUBMIT_MANAGER && (
                                            <div className="mt-2 mb-4">
                                                <RequestEditSession key={item.id} requestId={item.id} token={token}
                                                    production={false}
                                                    onClose={() => { void handleSubformClose(); }}>
                                                    {editorToken => (
                                                    <RequestedQuantityForm
                                                    requestId={item.id}
                                                    token={token}
                                                    editorToken={editorToken}
                                                    onClose={() => {
                                                        void handleSubformClose();
                                                    }}
                                                    onSaved={loadInbox}
                                                    onSubmitted={async () => {
                                                        setSelectedRequestId(null);
                                                        await loadInbox();
                                                    }}
                                                />
                                                    )}
                                                </RequestEditSession>
                                            </div>)}
                                    {selectedRequestId === item.id &&
                                        workFlowAction === WorkflowAction.START_PRODUCTION && (
                                            <div className="mt-2 mb-4">
                                                <RequestEditSession key={item.id} requestId={item.id} token={token}
                                                    production={true}
                                                    onClose={() => { void handleSubformClose(); }}>
                                                    {editorToken => (
                                                    <ProductionForm
                                                    requestId={item.id}
                                                    token={token}
                                                    editorToken={editorToken}
                                                    onClose={() => {
                                                        void handleSubformClose();
                                                    }}
                                                    onSaved={loadInbox}
                                                    onSubmitted={async () => {
                                                        setSelectedRequestId(null);
                                                        await loadInbox();
                                                    }}
                                                />
                                                    )}
                                                </RequestEditSession>
                                            </div>)}
                                    {selectedRequestId === item.id &&
                                        workFlowAction === WorkflowAction.CLOSE_REQUEST && (
                                            <div className="mt-2 mb-4">
                                                <RequestEditSession key={item.id} requestId={item.id} token={token}
                                                    production={false}
                                                    onClose={() => { void handleSubformClose(); }}>
                                                    {editorToken => (
                                                    <div><p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Saving quantities does not change stock. Closing this request will create its confirmed stock receipt. Do not also enter these goods as a manual receipt.</p><ReceivingForm
                                                    requestId={item.id}
                                                    token={token}
                                                    editorToken={editorToken}
                                                    onClose={() => {
                                                        void handleSubformClose();
                                                    }}
                                                    onSaved={loadInbox}
                                                    onSubmitted={async () => {
                                                        setSelectedRequestId(null);
                                                        await loadInbox();
                                                    }}
                                                /></div>
                                                    )}
                                                </RequestEditSession>
                                            </div>)}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {!loading && !error && totalItems > 0 && <nav aria-label="Inbox pages" className="mt-4 flex items-center justify-between gap-3 text-sm"><span>{totalItems} matching requests · Page {inboxPage}</span><div className="flex gap-2"><button type="button" disabled={selectedRequestId !== null || inboxPage <= 1} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-50" onClick={() => { setInboxPage(inboxPage - 1); setInbox([]); setLoading(true); }}>Previous</button><button type="button" disabled={selectedRequestId !== null || inboxPage * 20 >= totalItems} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-50" onClick={() => { setInboxPage(inboxPage + 1); setInbox([]); setLoading(true); }}>Next</button></div></nav>}
                {!loading && !error && inbox.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
                        Your inbox is empty.
                    </p>
                )}
                </fieldset>
            </div>
        </div>
    );
}

