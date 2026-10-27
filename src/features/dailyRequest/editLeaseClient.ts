"use client";

export const LEASE_LOST_EVENT = "request-edit-lease-lost";

export async function leaseRequest(
    requestId: string, token: string, editorToken: string,
    action: "acquire" | "renew" | "release",
): Promise<{ expiresAt?: string }> {
    const res = await fetch(`/api/daily-requests/${requestId}/lease`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, editorToken }),
        keepalive: action === "release",
        cache: "no-store",
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
        throw new Error(body.error?.message ?? "The editing lease could not be updated.");
    }
    return body.data;
}

export async function fetchWithEditLease(
    editorToken: string,
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("X-Request-Edit-Token", editorToken);
    const res = await fetch(input, { ...init, headers });
    if (res.status === 409) {
        const body = await res.clone().json().catch(() => null);
        if (body?.error?.code === "EDIT_LEASE_CONFLICT") {
            window.dispatchEvent(new CustomEvent(LEASE_LOST_EVENT, {
                detail: { editorToken, message: body.error.message },
            }));
        }
    }
    return res;
}
