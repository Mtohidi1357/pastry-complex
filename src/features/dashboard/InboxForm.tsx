"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RequestCapabilities } from "../requestPolicy/requestCapabilities";
import { WorkflowAction } from "../workflow/wrokFlowDefinition";
import InventoryForm from "../dailyRequest/components/InventoryForm";
import RequestedQuantityForm from "../dailyRequest/components/RequestQuantityForm";
import ProductionForm from "../dailyRequest/components/ProductionForm";
import { RequestStatus } from "@/generated/prisma/enums";
import ReceivingForm from "../dailyRequest/components/ReceivingForm";
import Sidebar from "@/components/layout/Sidebar";
import { Roles } from "@/lib/constants/roles";
import { LoggedInUser } from "../auth/authTypes";

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
    WORKSHOP_PROCESSING: "bg-amber-500/20 text-amber-300 border-amber-400/30",
    DRAFT: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
    INVENTORY_SUBMITTED: "bg-sky-500/20 text-sky-300 border-sky-400/30",
    MANAGER_SUBMITTED: "bg-red-500/20 text-red-300 border-red-400/30",
    DELETED: "red",
};

export default function InboxForm() {
    const [token, setToken] = useState("");
    const [user, setUser] = useState<LoggedInUser | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [expanded, setExpanded] = useState(true); // must match sidebar state
    const [inbox, setInbox] = useState<WorkItem[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedRequestId, setSelectedRequestId] =
        useState<string | null>(null);
    const [workFlowAction, setWorkFlowAction] = useState<WorkflowAction | null>(null);

    const router = useRouter();

    useEffect(() => {
    if (typeof window === "undefined") return;

    // Token
    console.log("token: " + localStorage.getItem("token"));
    setToken(localStorage.getItem("token") ?? "");
    console.log("token: " + token);
    // User (parsed safely)
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) as LoggedInUser : null);
      console.log(user?.role);
    } catch {
      setUser(null);
    }
    }, []);

    const loadInbox = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/dashboard/inbox", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token,
                },
            });

            if (!res.ok) {
                throw new Error("Failed to load inbox.");
            }

            const data = await res.json();
            setInbox(data.data.items);
            setTotalItems(data.data.totalItems);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load inbox."
            );
        } finally {
            setLoading(false);
        }
    }, [token]);
     
    useEffect(() => {
        if(token){
            loadInbox();
        }
    }, [loadInbox, token]);


    const handleRequestDetail = async (
        requestId: string,
        action: WorkflowAction
    ) => {
        setSelectedRequestId(requestId);
        setWorkFlowAction(action);
    };

    const handleTransition = async (
        requestId: string,
        action: WorkflowAction,
    ) => {
        try {

            const res = await fetch(`/api/daily-requests/${requestId}/transition`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token,
                },
                body: JSON.stringify({
                    action,
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(
                    data?.message ?? "Transition failed."
                );
            };
            //console.log(data);
            await loadInbox();

        } catch {

        }
    };

    return (
        <div className="w-full max-w-4xl rounded-2xl bg-white/10 backdrop-blur-lg p-8 shadow-2xl border border-white/20">
            <div>
            {/* Sidebar */}
            <Sidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />
            </div>
            <div
                className={`
                    min-h-screen flex flex-col
                    transition-all duration-300 ease-in-out
                    ${expanded ? "lg:pl-20" : "lg:pl-20"}
                    `}
            >
                <div>
                    <header className="flex items-center justify-between p-4 bg-gray/10 border-b">
                        <div className="flex items-center gap-4 px-6 py-4">
                            {/* Hamburger for mobile + desktop toggle */}
                            {(<button
                                onClick={() => {
                                    setExpanded(!expanded);
                                    setSidebarOpen(!sidebarOpen);
                                }}
                                className="p-2 rounded-lg hover:bg-gray-100"
                                aria-label="Toggle menu"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>)}

                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Your Inbox</h1>
                                <p className="text-sm text-gray-500">
                                    {inbox.length} entries available
                                </p>
                            </div>

                            {/* Actions in header */}
                            <div className="ml-auto flex items-center gap-2">
                                {(user && (user.role.code === Roles.ADMIN ||
                                  user.role.code === Roles.INV ||
                                  user.role.code === Roles.BM  
                                )) &&
                                 <button 
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                                    onClick={() => {router.push("/daily-request")}}
                                    >
                                    + New Entry
                                </button>}
                            </div>
                        </div>
                    </header>
                </div>
                

                <p className="mt-2 mb-6 text-center text-slate-300">
                    Work items assigned to you:
                </p>


                {error && (
                    <p className="mt-4 text-sm text-red-400">{error}</p>
                )}

                {inbox.length > 0 && (
                    <>
                        <p className="mt-6 mb-3 text-sm text-slate-400">
                            {totalItems} item{totalItems !== 1 ? "s" : ""}
                        </p>
                        <ul className="space-y-3">
                            {inbox.map((item) => (
                                <li
                                    key={item.id}
                                    className="rounded-xl bg-white/5 border border-white/10 p-4"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm text-slate-300">
                                            Business date:{" "}
                                            <span className="text-black">
                                                {formatDate(item.businessDate)}
                                            </span>
                                        </span>
                                        <span
                                            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] ??
                                                "bg-slate-500/20 text-slate-300 border-slate-400/30"
                                                }`}
                                        >
                                            {item.status.replace("_", " ")}
                                        </span>
                                    </div>

                                    <dl className="mt-3 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                                        <div className="flex justify-between">
                                            <dt className="text-slate-400">Submitted</dt>
                                            <dd className="text-slate-200">
                                                {formatDate(item.submittedAt)}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-slate-400">Approved</dt>
                                            <dd className="text-slate-200">
                                                {formatDate(item.approvedAt)}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-slate-400">Created</dt>
                                            <dd className="text-slate-200">
                                                {formatDate(item.createdAt)}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-slate-400">Branch</dt>
                                            <dd className="font-mono text-xs text-slate-300">
                                                {item.salesBranchName}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-slate-400">Last Action</dt>
                                            <dd className="text-slate-200">
                                                {formatDate(item.lastActionAt)}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-slate-400">Updated</dt>
                                            <dd className="font-mono text-xs text-slate-300">
                                                {formatDate(item.updatedAt)}
                                            </dd>
                                        </div>
                                    </dl>
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        {item.capabilities.canEdit && (
                                            <button type="button"
                                                className="w-full rounded-full bg-blue-500 py-1 font-medium text-sm text-white transition hover:bg-blue-600 active:scale-[0.98]">
                                                Edit
                                            </button>
                                        )}

                                        {item.capabilities.canDelete && (
                                            <button type="button"
                                                className="w-full rounded-full bg-blue-500 py-1 font-medium text-sm text-white transition hover:bg-blue-600 active:scale-[0.98]">
                                                Delete
                                            </button>
                                        )}

                                        {item.capabilities.canRestore && (
                                            <button type="button"
                                                className="w-full rounded-full bg-blue-500 py-1 font-medium text-sm text-white transition hover:bg-blue-600 active:scale-[0.98]">
                                                Restore
                                            </button>
                                        )}

                                        {/* SUBMIT_INVENTORY */}
                                        {item.capabilities.availableActions.includes(
                                            WorkflowAction.SUBMIT_INVENTORY
                                        ) && (
                                                <button
                                                    type="button"
                                                    className="w-full rounded-full bg-blue-500 py-1 font-medium text-sm text-white transition hover:bg-blue-600 active:scale-[0.98]"
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
                                                    className="w-full rounded-full bg-blue-500 py-1 font-medium text-sm text-white transition hover:bg-blue-600 active:scale-[0.98]"
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
                                                <button type="button"
                                                    className="w-full rounded-full bg-blue-500 py-1 font-medium text-sm text-white transition hover:bg-blue-600 active:scale-[0.98]"
                                                    onClick={() => {
                                                        handleRequestDetail(
                                                            item.id,
                                                            WorkflowAction.START_PRODUCTION
                                                        );
                                                        if (item.status !== RequestStatus.WORKSHOP_PROCESSING) {
                                                            handleTransition(
                                                                item.id,
                                                                WorkflowAction.START_PRODUCTION
                                                            );
                                                        }
                                                    }}>
                                                    Record/Edit Production
                                                </button>
                                            )}

                                        
                                        {/* CLOSE_REQUEST */}
                                        {item.capabilities.availableActions.includes(
                                            WorkflowAction.CLOSE_REQUEST
                                        ) && (
                                                <button type="button"
                                                    className="w-full rounded-full bg-blue-500 py-1 font-medium text-sm text-white transition hover:bg-blue-600 active:scale-[0.98]"
                                                    onClick={() =>
                                                        handleRequestDetail(
                                                            item.id,
                                                            WorkflowAction.CLOSE_REQUEST
                                                        )
                                                    }>
                                                    Close
                                                </button>
                                            )}

                                        {item.capabilities.availableActions.includes(
                                            WorkflowAction.CANCEL_REQUEST
                                        ) && (
                                                <button type="button"
                                                    className="w-full rounded-full bg-blue-500 py-1 font-medium text-sm text-white transition hover:bg-blue-600 active:scale-[0.98]"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                    </div>

                                    {selectedRequestId === item.id &&
                                        workFlowAction === WorkflowAction.SUBMIT_INVENTORY && (
                                            <div className="mt-2 mb-4">
                                                <InventoryForm
                                                    requestId={item.id}
                                                    token={token}
                                                    onClose={() =>
                                                        setSelectedRequestId(null)
                                                    }
                                                    onSaved={loadInbox}
                                                    onSubmitted={async () => {
                                                        setSelectedRequestId(null);
                                                        await loadInbox();
                                                    }}
                                                />
                                            </div>)}
                                    {selectedRequestId === item.id &&
                                        workFlowAction === WorkflowAction.SUBMIT_MANAGER && (
                                            <div className="mt-2 mb-4">
                                                <RequestedQuantityForm
                                                    requestId={item.id}
                                                    token={token}
                                                    onClose={() =>
                                                        setSelectedRequestId(null)
                                                    }
                                                    onSaved={loadInbox}
                                                    onSubmitted={async () => {
                                                        setSelectedRequestId(null);
                                                        await loadInbox();
                                                    }}
                                                />
                                            </div>)}
                                    {selectedRequestId === item.id &&
                                        workFlowAction === WorkflowAction.START_PRODUCTION && (
                                            <div className="mt-2 mb-4">
                                                <ProductionForm
                                                    requestId={item.id}
                                                    token={token}
                                                    onClose={() =>
                                                        setSelectedRequestId(null)
                                                    }
                                                    onSaved={loadInbox}
                                                    onSubmitted={async () => {
                                                        setSelectedRequestId(null);
                                                        await loadInbox();
                                                    }}
                                                />
                                            </div>)}
                                    {selectedRequestId === item.id &&
                                        workFlowAction === WorkflowAction.CLOSE_REQUEST && (
                                            <div className="mt-2 mb-4">
                                                <ReceivingForm
                                                    requestId={item.id}
                                                    token={token}
                                                    onClose={() =>
                                                        setSelectedRequestId(null)
                                                    }
                                                    onSaved={loadInbox}
                                                    onSubmitted={async () => {
                                                        setSelectedRequestId(null);
                                                        await loadInbox();
                                                    }}
                                                />
                                            </div>)}
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {!loading && !error && inbox.length === 0 && (
                    <p className="mt-6 text-center text-sm text-slate-400">
                        Your inbox is empty.
                    </p>
                )}
            </div>
        </div>
    );
}