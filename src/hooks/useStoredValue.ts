"use client";

import { useSyncExternalStore} from "react";

function subscribe(callback: () => void) {
    window.addEventListener("storage", callback);

    window.addEventListener("auth-change", callback);

    return () => {
        window.removeEventListener("storage", callback);

        window.removeEventListener("auth-change", callback);
    };
}

export function notifyAuthChange() {
    window.dispatchEvent(new Event("auth-change"));
}

export function useStoredValue(key: string) {
    return useSyncExternalStore( subscribe,
        () => window.localStorage.getItem(key),
        () => null,
    );
}