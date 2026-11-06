"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createEditorToken } from "../dailyRequest/createEditorToken";

export default function DocumentEditorLease({ url, token, onClose, children, expectedVersion }: {
    url: string; token: string; expectedVersion?: number; onClose: () => void;
    children: (lease: { editorToken: string; disabled: boolean }) => ReactNode;
}) {
    const [session, setSession] = useState<{ editorToken: string; disabled: boolean } | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const editorToken = createEditorToken();
        let disposed = false, acquired = false, renewing = false, lost = false;
        let lastRenewal = 0;
        async function call(action: "acquire" | "renew" | "release", keepalive = false) {
            const res = await fetch(url, { method: "POST", keepalive, cache: "no-store", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, token: editorToken }) });
            const body = await res.json();
            if (!res.ok || !body.success) throw new Error(body.error?.message ?? "Editing session could not be verified.");
            return body.data as { version?: number };
        }
        function release() { if (acquired) { acquired = false; void call("release", true).catch(() => { /* Server expiry releases abandoned sessions. */ }); } }
        function fail(err: unknown) {
            lost = true;
            setSession(value => value ? { ...value, disabled: true } : null);
            setError(err instanceof Error ? err.message : "Editing session lost. Close and reopen this editor.");
        }
        void call("acquire").then(value => {
            acquired = true;
            if (disposed) { release(); return; }
            if (expectedVersion !== undefined && value.version !== expectedVersion) { release(); throw new Error("This record changed since you opened it. Close and reopen the record to load its latest quantities before editing."); }
            lastRenewal = Date.now();
            setSession({ editorToken, disabled: false }); setError(null);
        }).catch(err => { if (!disposed) fail(err); });
        async function renew() {
            if (!acquired || disposed || renewing || lost) return;
            renewing = true;
            try { const value = await call("renew"); if (!disposed) { if (expectedVersion !== undefined && value.version !== expectedVersion) fail(new Error("This record changed while you were viewing it. Close and reopen it before continuing.")); else lastRenewal = Date.now(); } }
            catch (err) { if (!disposed) fail(err); }
            finally { renewing = false; }
        }
        const timer = window.setInterval(() => { if (acquired && !lost && Date.now() - lastRenewal > 85_000) fail(new Error("Your editing session could not be renewed. Close and reopen this editor. Unsaved changes were not submitted.")); else void renew(); }, 20_000);
        function visibility() { if (document.visibilityState === "visible") void renew(); }
        function pagehide() { release(); }
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("pagehide", pagehide);
        return () => { disposed = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); release(); };
    }, [url, token, expectedVersion]);
    return <section className="mb-4">
        {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>}
        {!session && !error && <p role="status">Checking exclusive editing access…</p>}
        {session && children(session)}
        {(!session || session.disabled) && <button type="button" className="mt-3 rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-900" onClick={onClose}>Close editor</button>}
    </section>;
}
