"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { fetchWithEditLease, leaseRequest, LEASE_LOST_EVENT } from "./editLeaseClient";

type Props = {
    requestId: string;
    token: string;
    production?: boolean;
    onClose: () => void;
    children: (editorToken: string) => ReactNode;
};

// Mount this keyed by request ID. Children never mount until acquisition succeeds.
export default function RequestEditSession({
    requestId, token, production = false, onClose, children,
}: Props) {
    const [activeToken, setActiveToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const generationRef = useRef(0);

    useEffect(() => {
        const generation = ++generationRef.current;
        // Reuse the token during React Strict Mode's setup/cleanup replay only.
        if (!tokenRef.current) tokenRef.current = crypto.randomUUID();
        const editorToken = tokenRef.current;
        let alive = true;
        let stopped = false;
        let heartbeat: ReturnType<typeof setTimeout> | undefined;
        let deadline: ReturnType<typeof setTimeout> | undefined;

        const clearTimers = () => {
            clearTimeout(heartbeat);
            clearTimeout(deadline);
        };
        const release = () => leaseRequest(requestId, token, editorToken, "release").catch(() => undefined);
        const lose = (message: string) => {
            if (!alive || stopped) return;
            stopped = true;
            clearTimers();
            setActiveToken(null);
            setError(message);
            void release();
        };
        const armDeadline = (expiresAt?: string) => {
            const remaining = expiresAt ? Date.parse(expiresAt) - Date.now() : NaN;
            if (!Number.isFinite(remaining) || remaining <= 0) {
                throw new Error("Your editing session expired. Close and reopen this editor.");
            }
            clearTimeout(deadline);
            deadline = setTimeout(() => {
                lose("Your editing session expired. Close and reopen this editor.");
            }, remaining);
        };
        const renew = async () => {
            try {
                const lease = await leaseRequest(requestId, token, editorToken, "renew");
                if (!alive || stopped) return;
                armDeadline(lease.expiresAt);
                heartbeat = setTimeout(() => { void renew(); }, 30_000);
            } catch (err) {
                lose(err instanceof Error ? err.message : "Editing session lost.");
            }
        };
        const onLeaseLost = (event: Event) => {
            const detail = (event as CustomEvent<{ editorToken: string; message: string }>).detail;
            if (detail.editorToken === editorToken) lose(detail.message);
        };
        window.addEventListener(LEASE_LOST_EVENT, onLeaseLost);

        // Keep the network phase free of React state writes. Completion callbacks
        // update state, matching the inbox's async loading pattern.
        const openEditor = async () => {
            const lease = await leaseRequest(requestId, token, editorToken, "acquire");
            if (!alive || stopped) return;
            if (production) {
                const res = await fetch(`/api/daily-requests/${requestId}`, {
                    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
                });
                const body = await res.json();
                if (!res.ok || !body.success) throw new Error(body.error?.message ?? "Failed to load request.");
                if (!alive || stopped) return;
                const status = body.data.request.status;
                if (status === "MANAGER_SUBMITTED") {
                    const transition = await fetchWithEditLease(editorToken,
                        `/api/daily-requests/${requestId}/transition`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ action: "START_PRODUCTION" }),
                        });
                    const result = await transition.json();
                    if (!transition.ok || !result.success) throw new Error(result.error?.message ?? "Failed to start production.");
                } else if (status !== "WORKSHOP_PROCESSING") {
                    throw new Error("This request is not available for production.");
                }
            }
            return lease;
        };
        const acquisition = openEditor()
            .then(lease => {
                if (!alive || stopped || !lease) return;
                armDeadline(lease.expiresAt);
                heartbeat = setTimeout(() => { void renew(); }, 30_000);
                setActiveToken(editorToken);
            })
            .catch((err: unknown) => {
                lose(err instanceof Error ? err.message : "Unable to open editor.");
            });
        return () => {
            alive = false;
            clearTimers();
            window.removeEventListener(LEASE_LOST_EVENT, onLeaseLost);
            // Wait for acquisition/transition to settle before release. Skip an
            // obsolete Strict Mode cleanup when the same mounted editor replays.
            void acquisition.then(() => {
                if (generationRef.current === generation) return release();
            });
        };
    }, [requestId, token, production]);

    if (activeToken && !error) return <>{children(activeToken)}</>;
    return (
        <section className="rounded-xl border border-gray-300 bg-white p-4 text-gray-900">
            <p role={error ? "alert" : "status"}>
                {error ?? "Opening editing session..."}
            </p>
            <button type="button" onClick={onClose}
                className="mt-3 font-medium text-blue-700 hover:underline">
                Close
            </button>
        </section>
    );
}
