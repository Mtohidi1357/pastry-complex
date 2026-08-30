"use client";

import { useCallback, useEffect, useState } from "react";
import { LoggedInUser } from "../auth/authTypes";

type Product = {
    id: string;
    code: string;
    name: string;
    displayName: string;
};

type RequestLine = {
    id: string;
    productId: string;
    previousBalance: number;
    currentBalance: number;
    requestedQty: number | null;
    reportTime: string | null;
    product: Product;
};

type NewRequest = {
    id: string;
    businessDate: string;
    status: string;
    lines: RequestLine[];
};

type LineDraft = {
    previousBalance: string;
    currentBalance: string;
    requestedQty: string;
    dirty: boolean;
    saving: boolean;
    deleting: boolean;
    saved: boolean;
    error?: string;
};

type RequestFormProps = {
    initBusinessDate: Date;
    branchCode: string;
    token: string;
    onClose: () => void;
    onSaved?: () => void;
    onSubmitted: () => void;
};

export default function CreateNewRequestForm({
    initBusinessDate,
    onClose,
    onSaved,
}: RequestFormProps) {
    const [token, setToken] = useState("");
    const [user, setUser] = useState<LoggedInUser | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [expanded, setExpanded] = useState(true); // must match sidebar state
    const [newRequest, setNewRequest] = useState<NewRequest | null>(null);
    const [businessDate, setBusinessDate] = useState<Date | null>(initBusinessDate);
    const [branchCode, setBranchCode] = useState("");
    const [showInventoryForm, setShowInventoryForm] = useState(false);
    const [requestCreated, setRequestCreated] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Token
        console.log("token: " + localStorage.getItem("token"));
        setToken(localStorage.getItem("token") ?? "");
        console.log("token: " + token);
        // User (parsed safely)
        try {
            const raw = localStorage.getItem("user");
            setBranchCode(JSON.parse(raw).branch.code + " " + JSON.parse(raw).branch.name);

            console.log(JSON.parse(raw));
            setUser(raw ? JSON.parse(raw) as LoggedInUser : null);
        } catch {
            setUser(null);
        }
    }, []);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] =
        useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] =
        useState<string | null>(null);
    
    const CreateRequest = async () => {
        setFormError(null);

        if (requestCreated) {
            setFormError(
                "You have already created a request."
            );
            return;
        }

        // if (!capabilities?.canEdit) {
        //     setFormError(
        //         "You are not allowed to submit this request."
        //     );
        //     return;
        // }

        setSubmitting(true);

        try {
            alert("create!")
            const res = await fetch(
                `/api/daily-requests`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`,
                    },

                    body: JSON.stringify({
                        businessDate: businessDate,
                        branchId: JSON.parse(raw).branch.id
                    }),
                }
            );

            const response = await res.json();
            console.log(response);
            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to create request."
                );
            }

            onSaved?.();
            onClose();

        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : "Failed to create request."
            );
        } finally {
            setSubmitting(false);
        }
    }
    return (
        <section className="w-full rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-2xl border border-blue-400/30 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-white">
                        Create New Request
                    </h1>
                    <p className="text-sm text-blue-200">New Daily Request</p>
                </div>
            </div>

            {/* Row: three elements side by side */}
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
                <div className="flex-1">
                    <label className="text-sm font-medium text-blue-100">
                        Business Date
                    </label>
                    <input
                        type="date"
                        value={businessDate?.toString()}
                        className="mt-2 w-full rounded-xl bg-white/10 text-white border border-blue-400/40 px-4 py-3 placeholder:text-blue-200 outline-none focus:ring-2 focus:ring-cyan-300 transition"
                    />
                </div>

                <div className="flex-1">
                    <label className="text-sm font-medium text-blue-100">
                        Branch
                    </label>
                    <input
                        type="text"
                        value={branchCode}
                        disabled={true}
                        className="mt-2 w-full rounded-xl bg-white/10 text-white border border-blue-400/40 px-4 py-3 outline-none opacity-70 cursor-not-allowed focus:ring-2 focus:ring-cyan-300 transition"
                    />
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setShowInventoryForm((prev) => !prev);
                        alert();
                        CreateRequest();
                    }}
                    className="sm:w-36 rounded-xl bg-cyan-400 py-3 font-semibold text-blue-950 shadow-lg transition hover:bg-cyan-300 active:scale-[0.98]"
                >
                    Create
                </button>
            </div>

            {/* InventoryForm appears below the row when Create is clicked */}
            {showInventoryForm && (
                <div className="mt-6 rounded-xl border border-blue-400/30 bg-white/10 p-5 backdrop-blur">
                    {/* 👇 Put your InventoryForm content here */}
                    <p className="text-sm text-blue-100">
                        InventoryForm fields go here.
                    </p>
                </div>
            )}

            {/* Error Message */}
            {formError && (
                <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/20 px-4 py-3 text-center text-sm text-red-100">
                    {formError}
                </div>
            )}
        </section>
    );
}