"use client";

import { useRouter } from "next/navigation";
import { useRef, useEffect, useState } from "react";
import { LoggedInUser } from "../auth/authTypes";
import InventoryForm from "./components/InventoryForm";

type RequestFormProps = {
    initBusinessDate: Date;
    initBranchId:string,
    branchCode: string;
    token: string;
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
    const [token, setToken] = useState("");
    const [user, setUser] = useState<LoggedInUser | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [expanded, setExpanded] = useState(true); // must match sidebar state
    const [newRequestId, setNewRequestId] = useState<string | null>(null);
    const [businessDate, setBusinessDate] = useState<Date | null>(null);
    const [branchCode, setBranchCode] = useState("");
    const [branchId, setBranchId] = useState(initBranchId)
    const [showInventoryForm, setShowInventoryForm] = useState(false);
    const [requestCreated, setRequestCreated] = useState(false);
    const submittigRef =useRef(false);
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] =
        useState<string | null>(null);
    const [successMessage, setSuccessMessage]= useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] =
        useState<string | null>(null);

    const router = useRouter();

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Token
        //console.log("token: " + localStorage.getItem("token"));
        const storedToken = localStorage.getItem("token") ?? "";
        setToken(storedToken);
        console.log("token: " + token);
        const raw = localStorage.getItem("user");
        if(!raw) return;

        // User (parsed safely)
        try {
            const parsedUser = JSON.parse(raw) as LoggedInUser;
            setUser(parsedUser);
            setBranchCode(parsedUser.branch.code + " " + parsedUser.branch.name);
            setBranchId(parsedUser.branch.id);
        } catch {
            setUser(null);
            setFormError("Invalid user data in local storage.")
        }
    }, []);
    
    
    const CreateRequest = async () => {
        if(submittigRef.current) return;
        if(requestCreated) return;

        submittigRef.current = true;
        setFormError(null);
        setSuccessMessage(null);
        setLoading(true);
      
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
                    response.message ??
                    "Failed to create request."
                );
            }

            if(!response?.success){
                throw new Error(response?.message ?? "Failed to create request.")
            }

            setRequestCreated(true);
            setNewRequestId(response.data.id);
            setSuccessMessage(`Request created for ${user?.branch.name} at date: ${businessDate}`);

            onSaved?.();
            onClose();
            return response.data.id

        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
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
                    onClick={async => {
                        if (!businessDate) {
                            setFormError("Business date must be picked.");
                            return;
                        }
                        CreateRequest();
                        if (newRequestId) {
                            setShowInventoryForm(true);
                        }
                        //console.log("create clicked");

                    }}
                    disabled={loading || requestCreated}
                    className="sm:w-36 rounded-xl bg-cyan-400 py-3 font-semibold text-blue-950 shadow-lg transition hover:bg-cyan-300 active:scale-[0.98]"
                >
                    {requestCreated ? "Created" : loading ? "Creating..." : "Create"}
                </button>
            </div>

            {/* InventoryForm appears below the row when Create is clicked */}
            {showInventoryForm && (
                <InventoryForm
                    requestId={newRequestId ?? ""}
                    token={token}
                    onClose={() => 
                        setShowInventoryForm(false)
                    }
                    onSaved={() => router.push("/")}
                    onSubmitted={() =>
                        router.push("/dashboard/inbox")
                    }
                />
            )}

            {/* Error Message */}
            {formError && (
                <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/20 px-4 py-3 text-center text-sm text-red-100">
                    {formError}
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