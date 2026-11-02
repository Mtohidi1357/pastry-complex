"use client";

import { useRef, useState } from "react";
import { fetchWithEditLease } from "./editLeaseClient";

type Props = {
    requestId: string;
    token: string;
    editorToken: string;
    onClose: () => void;
    onDeleted: () => Promise<void>;
};

export default function DeleteRequestForm({ requestId, token, editorToken, onClose, onDeleted }: Props) {
    const busy = useRef(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function deleteRequest() {
        if (busy.current) return;
        busy.current = true;
        setSubmitting(true);
        setError(null);
        try {
            const response = await fetchWithEditLease(editorToken, `/api/daily-requests/${requestId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Deletion failed.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Deletion failed.");
            busy.current = false;
            setSubmitting(false);
            return;
        }
        // Successful deletion must not become retryable if inbox refresh fails.
        await onDeleted();
    }

    return (
        <section className="mt-3 rounded-xl bg-white p-4 text-gray-900" aria-label="Delete request">
            <h2 className="font-semibold">Move this request to Trash?</h2>
            <p className="mt-2 text-sm">It will leave the inbox. Its quantities and history will be retained. A branch manager or administrator can restore it from Trash if no replacement exists for the same branch and business date.</p>
            {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
            <div className="mt-3 flex gap-3">
                <button type="button" disabled={submitting} onClick={() => { void deleteRequest(); }}
                    className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
                    {submitting ? "Deleting…" : "Confirm delete"}
                </button>
                <button type="button" disabled={submitting} onClick={onClose}
                    className="rounded border border-gray-400 px-4 py-2">Keep request</button>
            </div>
        </section>
    );
}
