"use client";

import { useRef, useState } from "react";
import { WorkflowAction } from "../workflow/wrokFlowDefinition";
import { fetchWithEditLease } from "./editLeaseClient";

type Props = {
    requestId: string;
    token: string;
    editorToken: string;
    onClose: () => void;
    onCancelled: () => Promise<void>;
};

export default function CancelRequestForm({ requestId, token, editorToken, onClose, onCancelled }: Props) {
    const busy = useRef(false);
    const [submitting, setSubmitting] = useState(false);
    const [note, setNote] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function cancelRequest() {
        if (busy.current) return;
        busy.current = true;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetchWithEditLease(editorToken, `/api/daily-requests/${requestId}/transition`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ action: WorkflowAction.CANCEL_REQUEST, note: note.trim() || undefined }),
            });
            const body = await res.json();
            if (!res.ok || !body.success) throw new Error(body.error?.message ?? "Cancellation failed.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cancellation failed.");
            busy.current = false;
            setSubmitting(false);
            return;
        }
        // The transition succeeded. Refresh separately so a refresh failure
        // cannot invite a second cancellation attempt.
        await onCancelled();
    }

    return (
        <section className="mt-3 rounded-xl bg-white p-4 text-gray-900" aria-label="Cancel request">
            <h2 className="font-semibold">Cancel this request?</h2>
            <p className="mt-2 text-sm">This ends the workflow and removes the request from the inbox. Its quantities and history are retained. Cancellation cannot be undone here.</p>
            <label className="mt-3 block text-sm">
                Reason (optional)
                <textarea value={note} onChange={event => setNote(event.target.value)} disabled={submitting}
                    className="mt-1 block w-full rounded border border-gray-400 bg-white p-2 text-gray-900" />
            </label>
            {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
            <div className="mt-3 flex gap-3">
                <button type="button" disabled={submitting} onClick={() => { void cancelRequest(); }}
                    className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
                    {submitting ? "Cancelling…" : "Confirm cancellation"}
                </button>
                <button type="button" disabled={submitting} onClick={onClose}
                    className="rounded border border-gray-400 px-4 py-2">Keep request</button>
            </div>
        </section>
    );
}
