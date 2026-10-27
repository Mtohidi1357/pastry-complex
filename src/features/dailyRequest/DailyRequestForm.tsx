"use client";

import { useRouter } from "next/navigation";
import { useRef, useEffect, useState } from "react";
import { useStoredValue } from "@/hooks/useStoredValue";
import { LoggedInUser } from "../auth/authTypes";
import RequestEditSession from "./RequestEditSession";
import InventoryForm from "./components/InventoryForm";

type RequestFormProps = {
    initBusinessDate: Date;
    initBranchId: string,
    onClose: () => void;
    onSaved?: () => void;
    onSubmitted: () => void;
};
export default function CreateNewRequestForm({
    initBusinessDate,
    initBranchId,
    onClose,
    onSaved,
}: RequestFormProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [expanded, setExpanded] = useState(true); // must match sidebar state
    const [newRequestId, setNewRequestId] = useState<string | null>(null);
    const [businessDate, setBusinessDate] = useState<Date | null>(initBusinessDate);
    const [showInventoryForm, setShowInventoryForm] = useState(false);
    const [requestCreated, setRequestCreated] = useState(false);
    const submittigRef = useRef(false);
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] =
        useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] =
        useState<string | null>(null);
    const router = useRouter();

    const token = useStoredValue("token") ?? "";
    const storedUser = useStoredValue("user");

    let user: LoggedInUser | null = null;
    let storageError: string | null = null;

    if (storedUser) {
        try {
            const parsed = JSON.parse(storedUser) as LoggedInUser;
            if (!parsed?.branch?.id) {
                storageError = "Stored user data has no branch.";
            } else {
                user = parsed;
            }
        } catch {
            storageError = "Invalid user data in local storage.";
        }
    }
    const branchId = user?.branch.id ?? initBranchId;
    const branchCode = user
        ? `${user.branch.code} ${user.branch.name}`
        : "";

    const CreateRequest = async () => {
        if (submittigRef.current) return null;
        if (requestCreated) return null;
        if (!token || !user || storageError){
            setFormError(storageError ?? "Please login again.");
            return;
        }
        submittigRef.current = true;
        setFormError(null);
        setSuccessMessage(null);
        setLoading(true);
        let rVal;
        try {
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
                        branchId: branchId
                    }),
                }
            );

            const response = await res.json().catch(() => null);

            console.log(response);
            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ?
                        response.message + ' 106' :
                        "Failed to create request."
                );
            }
            setRequestCreated(true);
            setNewRequestId(response.data.id);
            setShowInventoryForm(true);
            setSuccessMessage(`Request created for ${user?.branch.name} at date: ${businessDate}`);
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message + " 125"
                    : "Failed to create request."
            );
        } finally {
            submittigRef.current = false;
            setLoading(false);
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
                        value={businessDate ? businessDate.toISOString().split("T")[0] : ""}
                        onChange={(e) =>
                            setBusinessDate(e.target.value ? new Date(e.target.value) : null)
                        }
                        disabled={loading}
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
                    onClick={async () => {
                        if (!businessDate) {
                            setFormError("Business date must be picked.");
                            return;
                        }
                        await CreateRequest();
                    }}
                    disabled={loading || requestCreated}
                    className="sm:w-36 rounded-xl bg-cyan-400 py-3 font-semibold text-blue-950 shadow-lg transition hover:bg-cyan-300 active:scale-[0.98]"
                >
                    {requestCreated ? "Created" : loading ? "Creating..." : "Create"}
                </button>
            </div>
            {/* InventoryForm appears below the row when Create is clicked */}
            {newRequestId && (
                <RequestEditSession key={newRequestId} requestId={newRequestId} token={token}
                    onClose={() => router.push("/dashboard/inbox")}>
                    {editorToken => (
                        <InventoryForm
                            requestId={newRequestId}
                            token={token}
                            editorToken={editorToken}
                            onClose={() => router.push("/dashboard/inbox")}
                            onSubmitted={() => router.push("/dashboard/inbox")}
                        />
                    )}
                </RequestEditSession>
            )}
            {/* Error Message */}
            {(formError || storageError) && (
                <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/20 px-4 py-3 text-center text-sm text-red-100">
                    {formError || storageError}
                </div>
            )}
            {/* Success Message */}
            {successMessage && (
                <div className="mt-4 rounded-lg border border-green-400/30 bg-red-500/20 px-4 py-3 text-center text-sm text-green-100">
                    {successMessage}
                </div>
            )}
        </section>
    );
}

