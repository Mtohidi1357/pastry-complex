"use client";
import WorkflowFormFrame from "./WorkflowFormFrame";
import InventoryPanel from "./InventoryPanel";

import { useRef, useState } from "react";
import { useStoredValue } from "@/hooks/useStoredValue";
import type { LoggedInUser } from "../auth/authTypes";
import { canCreateRequests } from "./requestCreationPolicy";
import RequestEditSession from "./RequestEditSession";
import InventoryForm from "./components/InventoryForm";

type RequestFormProps = {
    initBusinessDate: Date;
    initBranchId: string;
    onClose: () => void;
    onSaved?: () => void;
    onSubmitted: () => void;
};

function CreateNewRequestForm({
    initBusinessDate, initBranchId, onClose, onSubmitted,
}: RequestFormProps) {
    const token = useStoredValue("token") ?? "";
    const storedUser = useStoredValue("user");
    const [businessDate, setBusinessDate] = useState<Date | null>(() => {
        if (!initBusinessDate) return null;
        const date = new Date(initBusinessDate);
        date.setUTCHours(0, 0, 0, 0);
        return date;
    });
    const [requestId, setRequestId] = useState<string | null>(null);
    const [created, setCreated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const submittingRef = useRef(false);

    let user: LoggedInUser | null = null;
    let storageError: string | null = null;
    if (storedUser) {
        try {
            const parsed = JSON.parse(storedUser) as LoggedInUser;
            if (!parsed?.branch?.id || !parsed.role?.code) {
                storageError = "Your saved login data is incomplete. Please log in again.";
            } else {
                user = parsed;
            }
        } catch {
            storageError = "Your saved login data is invalid. Please log in again.";
        }
    }
    const branchId = user?.branch.id ?? initBranchId;
    const branchName = user ? `${user.branch.code} ${user.branch.name}` : "";

    const createRequest = async () => {
        if (submittingRef.current || created) return;
        if (!token || !user || storageError) {
            setFormError(storageError ?? "Please log in again.");
            return;
        }
        if (!canCreateRequests(user.role.code)) {
            setFormError("Only inventory users and branch managers can create requests.");
            return;
        }
        if (!businessDate) {
            setFormError("Pick a business date.");
            return;
        }
        submittingRef.current = true;
        setLoading(true);
        setFormError(null);
        try {
            const res = await fetch("/api/daily-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessDate, branchId }),
            });
            const response = await res.json().catch(() => null);
            if (!res.ok || !response?.success) {
                throw new Error(response?.error?.message ?? response?.message ?? "Failed to create request.");
            }
            setCreated(true);
            const assignee = response.data.initialAssignee;
            if (assignee?.id === user.id) {
                setRequestId(response.data.id);
                setMessage(`Request created for ${user.branch.name}.`);
            } else {
                setMessage(`Request created and assigned to ${assignee?.username ?? "your branch inventory user"} for inventory reporting.`);
            }
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "Failed to create request.");
        } finally {
            submittingRef.current = false;
            setLoading(false);
        }
    };

    return (
        <section className="w-full max-w-5xl rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold">New Request</h1>
                    <p className="text-sm text-blue-100">Create a daily request for your branch.</p>
                </div>
                <button type="button" onClick={onClose} disabled={loading}
                    className="rounded-lg px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50">
                    Back to inbox
                </button>
            </div>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
                <label className="flex-1 text-sm font-medium text-blue-100">
                    Business date
                    <input type="date"
                        value={businessDate ? businessDate.toISOString().slice(0, 10) : ""}
                        onChange={event => setBusinessDate(event.target.value ? new Date(event.target.value) : null)}
                        disabled={loading || created}
                        className="mt-2 block w-full rounded-xl border border-blue-300 bg-white px-4 py-3 text-gray-900" />
                </label>
                <label className="flex-1 text-sm font-medium text-blue-100">
                    Branch
                    <input type="text" value={branchName} readOnly
                        className="mt-2 block w-full rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-gray-900" />
                </label>
                <button type="button" onClick={() => { void createRequest(); }}
                    disabled={loading || created || !token || !canCreateRequests(user?.role.code)}
                    className="rounded-xl bg-cyan-300 px-6 py-3 font-semibold text-blue-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">
                    {created ? "Created" : loading ? "Creating..." : "Create"}
                </button>
            </div>
            {(formError || storageError) && (
                <p role="alert" className="mt-4 rounded-lg bg-red-950/60 p-3 text-red-50">{formError || storageError}</p>
            )}
            {message && <p role="status" className="mt-4 rounded-lg bg-green-950/50 p-3 text-green-50">{message}</p>}
            {requestId && (
                <div className="mt-5 text-gray-900">
                    <RequestEditSession key={requestId} requestId={requestId} token={token} onClose={onClose}>
                        {editorToken => (
                            <InventoryPanel><InventoryForm requestId={requestId} token={token} editorToken={editorToken}
                                onClose={onClose} onSubmitted={onSubmitted} /></InventoryPanel>
                        )}
                    </RequestEditSession>
                </div>
            )}
        </section>
    );
}


// Pastry workflow design wrapper v1
export default function StyledCreateNewRequestForm(props: Parameters<typeof CreateNewRequestForm>[0]) {
    return <WorkflowFormFrame stage="new"><CreateNewRequestForm {...props} /></WorkflowFormFrame>;
}
