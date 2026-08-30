"use client";

import { useCallback, useEffect, useState } from "react";

type Product = {
    id: string;
    code: string;
    name: string;
    displayName: string;
};

type InventoryLine = {
    id: string;
    productId: string;
    previousBalance: number;
    currentBalance: number;
    requestedQty: number | null;
    reportTime: string | null;
    product: Product;
};

type RequestCapabilities = {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canRestore: boolean;
    availableActions: string[];
};

type InventoryRequest = {
    id: string;
    businessDate: string;
    status: string;
    lines: InventoryLine[];
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

type InventoryFormProps = {
    requestId: string;
    token: string;
    onClose: () => void;
    onSaved?: () => void;
    onSubmitted: () => void;
};

export default function InventoryForm({
    requestId,
    token,
    onClose,
    onSaved,
}: InventoryFormProps) {
    console.log(requestId)
    const [request, setRequest] =
        useState<InventoryRequest | null>(null);

    const [capabilities, setCapabilities] =
        useState<RequestCapabilities | null>(null);

    const [drafts, setDrafts] =
        useState<Record<string, LineDraft>>({});

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] =
        useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] =
        useState<string | null>(null);

    const loadRequest = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        console.log(requestId);

        try {
            const res = await fetch(
                `/api/daily-requests/${requestId}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const response = await res.json();

            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to load request."
                );
            }

            const data = response.data;
            console.log(data);
            setRequest(data.request);
            setCapabilities(data.capabilities);

            const initialDrafts: Record<
                string,
                LineDraft
            > = {};

            for (const line of data.request.lines) {
                initialDrafts[line.id] = {
                    previousBalance:
                        String(
                            line.previousBalance ?? ""
                        ),

                    currentBalance:
                        String(
                            line.currentBalance ?? ""
                        ),

                    requestedQty:
                        line.requestedQty === null
                            ? ""
                            : String(
                                line.requestedQty
                            ),

                    dirty: false,
                    saving: false,
                    deleting: false,
                    saved: false,
                };
            }

            setDrafts(initialDrafts);
        } catch (error) {
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Failed to load request."
            );
        } finally {
            setLoading(false);
        }
    }, [requestId, token]);

    useEffect(() => {
        loadRequest();
    }, [loadRequest]);

    const updateDraft = (
        lineId: string,
        field: keyof Pick<
            LineDraft,
            | "previousBalance"
            | "currentBalance"
            | "requestedQty"
        >,
        value: string
    ) => {
        setDrafts(current => {
            const existing = current[lineId];

            if (!existing) {
                return current;
            }

            return {
                ...current,

                [lineId]: {
                    ...existing,

                    [field]: value,

                    dirty: true,
                    saved: false,
                    error: undefined,
                },
            };
        });
    };

    const saveLine = async (lineId: string) => {
        const draft = drafts[lineId];

        if (!draft || !request) {
            return;
        }

        if (!draft.dirty) {
            return;
        }

        const previousBalance =
            Number(draft.previousBalance);

        const currentBalance =
            Number(draft.currentBalance);

        const requestedQty =
            Number(draft.requestedQty);

        let validationError: string | undefined;

        if (
            draft.previousBalance === "" ||
            draft.currentBalance === "" ||
            draft.requestedQty === ""
        ) {
            validationError =
                "All three quantities are required.";
        } else if (
            !Number.isInteger(previousBalance) ||
            !Number.isInteger(currentBalance) ||
            !Number.isInteger(requestedQty)
        ) {
            validationError =
                "Quantities must be whole numbers.";
        } else if (requestedQty === 0) {
            validationError =
                "Requested quantity must be greater than zero.";
        } else if (
            currentBalance > previousBalance
        ) {
            validationError =
                "Current balance cannot be greater than previous balance.";
        }

        if (validationError) {
            setDrafts(current => ({
                ...current,

                [lineId]: {
                    ...current[lineId],
                    error: validationError,
                },
            }));

            return;
        }

        setDrafts(current => ({
            ...current,

            [lineId]: {
                ...current[lineId],
                saving: true,
                error: undefined,
            },
        }));

        try {
            const res = await fetch(
                `/api/daily-requests/${requestId}/lines/${lineId}`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`,
                    },

                    body: JSON.stringify({
                        operation:
                            "RECORD_INVENTORY",

                        previousBalance,
                        currentBalance,
                        requestedQty,
                    }),
                }
            );

            const response = await res.json();

            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to save inventory."
                );
            }

            setDrafts(current => ({
                ...current,

                [lineId]: {
                    ...current[lineId],

                    saving: false,
                    dirty: false,
                    saved: true,
                    error: undefined,
                },
            }));

            onSaved?.();
        } catch (error) {
            setDrafts(current => ({
                ...current,

                [lineId]: {
                    ...current[lineId],

                    saving: false,

                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to save inventory.",
                },
            }));
        }
    };

    const deleteLine = async (
        lineId: string,
        productName: string) => {
        const draft = drafts[lineId];

        if (!draft) {
            return;
        }

        const confirmed = window.confirm(
            `Remove ${productName} from the request?`
        );

        if (!confirmed) {
            return;
        }

        setDrafts(current => ({
            ...current,

            [lineId]: {
                ...current[lineId],
                deleting: true,
                error: undefined,
            },
        }));

        try {
            const res = await fetch(
                `/api/daily-requests/${requestId}/lines/${lineId}`,
                {
                    method: "DELETE",

                    headers: {
                        Authorization:
                            `Bearer ${token}`,
                    },
                }
            );

            const response = await res.json();

            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to delete line."
                );
            }

            setRequest(current => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,

                    lines: current.lines.filter(
                        line => line.id !== lineId
                    ),
                };
            });

            setDrafts(current => {
                const next = { ...current };

                delete next[lineId];

                return next;
            });
        } catch (error) {
            setDrafts(current => ({
                ...current,

                [lineId]: {
                    ...current[lineId],

                    deleting: false,

                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to delete line.",
                },
            }));
        }
    };

    const hasUnsavedChanges =
        Object.values(drafts).some(
            draft => draft.dirty
        );

    const submitInventory = async () => {
        setFormError(null);

        if (hasUnsavedChanges) {
            setFormError(
                "You have unsaved inventory changes. Save them before submitting."
            );
            return;
        }

        if (!capabilities?.canEdit) {
            setFormError(
                "You are not allowed to submit this request."
            );
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch(
                `/api/daily-requests/${requestId}/transition`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`,
                    },

                    body: JSON.stringify({
                        action: "SUBMIT_INVENTORY",
                    }),
                }
            );

            const response = await res.json();

            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to submit inventory."
                );
            }

            // The request has now moved to the
            // next workflow state.
            onSaved?.();
            onClose();

        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : "Failed to submit inventory."
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <section className="rounded-xl border bg-white p-4 shadow">
                <p className="text-sm text-gray-600">
                    Loading inventory...
                </p>
            </section>
        );
    }

    if (loadError || !request) {
        return (
            <section className="rounded-xl border bg-white p-4 shadow">
                <p className="text-sm text-red-600">
                    {loadError ??
                        "Request could not be loaded."}
                </p>

                <button
                    type="button"
                    onClick={onClose}
                    className="mt-3 text-sm text-blue-600 hover:underline"
                >
                    Close
                </button>
            </section>
        );
    }

    return (
        <section className="rounded-xl border bg-white text-black shadow">

            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">

                <div>
                    <h2 className="text-base font-semibold">
                        Record Inventory
                    </h2>

                    <div className="mt-0.5 text-xs text-gray-500">
                        Request: {request.id}
                        {" · "}
                        Business date:{" "}
                        {new Date(
                            request.businessDate
                        ).toLocaleDateString()}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="text-sm text-gray-500 hover:text-gray-900"
                >
                    Close
                </button>
            </div>

            {/* Permission warning */}
            {!capabilities?.canEdit && (
                <div className="border-b bg-yellow-50 px-4 py-2 text-xs text-yellow-700">
                    You are not allowed to edit this request.
                </div>
            )}

            {formError && (
                <div className="border-b bg-red-50 px-4 py-2 text-xs text-red-700">
                    {formError}
                </div>
            )}

            {/* Spreadsheet */}
            <div className="max-h-[60vh] overflow-auto mobile-cards">
                <div className="overflow-x-auto">

                <table className="w-full border-collapse text-xs sm:table table-fixed">

                    <thead className="sticky top-0 z-10 bg-gray-100">

                        <tr className="border-b">

                            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                                Product
                            </th>

                            <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                                Previous
                            </th>

                            <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                                Current
                            </th>

                            <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                                Requested
                            </th>

                            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                                Actions
                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {request.lines.map(line => {
                            const draft =
                                drafts[line.id];

                            if (!draft) {
                                return null;
                            }

                            const busy =
                                draft.saving ||
                                draft.deleting;

                            return (
                                <tr
                                    key={line.id}
                                    className="border-b last:border-b-0 hover:bg-gray-50"
                                >

                                    {/* Product */}
                                    <td data-label="Product" className="px-3 py-1.5">

                                        <div className="whitespace-nowrap font-medium">
                                            {
                                                line
                                                    .product
                                                    .displayName
                                            }
                                        </div>

                                        <div className="text-[10px] text-gray-400">
                                            {
                                                line
                                                    .product
                                                    .code
                                            }
                                        </div>

                                    </td>

                                    {/* Previous */}
                                    <td data-label="Previous" className="px-2 py-1.5">

                                        <input
                                            type="number"
                                            min="0"
                                            value={
                                                draft.previousBalance
                                            }
                                            disabled={
                                                !capabilities?.canEdit ||
                                                busy
                                            }
                                            onChange={e =>
                                                updateDraft(
                                                    line.id,
                                                    "previousBalance",
                                                    e.target.value
                                                )
                                            }
                                            className="h-7 w-20 rounded border px-2 text-right text-xs outline-none focus:border-blue-500"
                                        />

                                    </td>

                                    {/* Current */}
                                    <td data-label="Current" className="px-2 py-1.5">

                                        <input
                                            type="number"
                                            min="0"
                                            value={
                                                draft.currentBalance
                                            }
                                            disabled={
                                                !capabilities?.canEdit ||
                                                busy
                                            }
                                            onChange={e =>
                                                updateDraft(
                                                    line.id,
                                                    "currentBalance",
                                                    e.target.value
                                                )
                                            }
                                            className="h-7 w-20 rounded border px-2 text-right text-xs outline-none focus:border-blue-500"
                                        />

                                    </td>

                                    {/* Requested */}
                                    <td data-label="Requested" className="px-2 py-1.5">

                                        <input
                                            type="number"
                                            min="1"
                                            value={
                                                draft.requestedQty
                                            }
                                            disabled={
                                                !capabilities?.canEdit ||
                                                busy
                                            }
                                            onChange={e =>
                                                updateDraft(
                                                    line.id,
                                                    "requestedQty",
                                                    e.target.value
                                                )
                                            }
                                            className="h-7 w-20 rounded border px-2 text-right text-xs outline-none focus:border-blue-500"
                                        />

                                    </td>

                                    {/* Actions */}
                                    <td data-label="Actions" className="px-3 py-1.5">

                                        <div className="flex items-center gap-2 whitespace-nowrap">

                                            {draft.saving ? (
                                                <span className="text-gray-400">
                                                    saving...
                                                </span>
                                            ) : draft.saved &&
                                                !draft.dirty ? (
                                                <span className="text-green-600">
                                                    saved
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        !capabilities?.canEdit ||
                                                        !draft.dirty ||
                                                        busy
                                                    }
                                                    onClick={() =>
                                                        saveLine(
                                                            line.id
                                                        )
                                                    }
                                                    className="text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300"
                                                >
                                                    save
                                                </button>
                                            )}

                                            <span className="text-gray-300">
                                                |
                                            </span>

                                            {draft.deleting ? (
                                                <span className="text-gray-400">
                                                    deleting...
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        busy ||
                                                        !capabilities?.canEdit
                                                    }
                                                    onClick={() =>
                                                        deleteLine(
                                                            line.id,
                                                            line.product.displayName
                                                        )
                                                    }
                                                    className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300"
                                                >
                                                    delete
                                                </button>
                                            )}

                                        </div>

                                        {draft.error && (
                                            <div className="mt-1 max-w-xs text-[10px] text-red-600">
                                                {draft.error}
                                            </div>
                                        )}

                                    </td>

                                </tr>
                            );
                        })}

                    </tbody>

                </table>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t px-4 py-2">

                <div className="text-xs text-gray-500">
                    {request.lines.length} product
                    {request.lines.length === 1
                        ? ""
                        : "s"}

                    {hasUnsavedChanges && (
                        <span className="ml-3 text-amber-600">
                            unsaved changes
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    onClick={submitInventory}
                    disabled={
                        submitting ||
                        hasUnsavedChanges ||
                        !capabilities?.canEdit
                    }
                    className="text-sm font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300"
                >
                    {submitting
                        ? "submitting..."
                        : "Submit Inventory"}
                </button>

            </div>

        </section>
    );
}