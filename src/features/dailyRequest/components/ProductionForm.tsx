"use client";

import { useCallback, useEffect, useState } from "react";

type Product = {
    id: string;
    code: string;
    name: string;
    displayName: string;
};

type ProductionLine = {
    id: string;
    productId: string;
    producedQty: number;
    requestedQty: number | null;
    product: Product;
};

type RequestCapabilities = {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canRestore: boolean;
    availableActions: string[];
};

type ProductionRequest = {
    id: string;
    businessDate: string;
    status: string;
    lines: ProductionLine[];
};

type LineDraft = {
    producedQty: string;
    requestedQty: string;
    dirty: boolean;
    saving: boolean;
    deleting: boolean;
    saved: boolean;
    error?: string;
    warning?: LineWarning;
};

type ProductionFormProps = {
    requestId: string;
    token: string;
    onClose: () => void;
    onSaved?: () => void;
    onSubmitted: () => void;
};

enum LineWarning {
    PRODUCESQTY_LESS_THAN_REQUESTED = "PRODUCESQTY_LESS_THAN_REQUESTED",
    PRODUCESQTY_GREATER_THAN_REQUESTED = "PRODUCESQTY_GREATER_THAN_REQUESTED"
}

export default function ProductionForm({
    requestId,
    token,
    onClose,
    onSaved,
}: ProductionFormProps) {
    const [request, setRequest] =
        useState<ProductionRequest | null>(null);

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
        console.log("load request");

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
            setRequest(data.request);
            setCapabilities(data.capabilities);

            const initialDrafts: Record<
                string,
                LineDraft
            > = {};

            for (const line of data.request.lines) {
                initialDrafts[line.id] = {
                    producedQty:
                        String(
                            line.producedQty ?? ""
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
                    warning: (
                        line.requestedQty > line.producedQty
                    ) ? LineWarning.PRODUCESQTY_LESS_THAN_REQUESTED : (
                        (
                            line.requestedQty < line.producedQty
                        ) ? LineWarning.PRODUCESQTY_GREATER_THAN_REQUESTED : undefined
                    ),
                    error: (
                        line.producedQty === null
                    ) ? "Produced qty Must be entered" : ""
                };
            }
            console.log("About to set drafts ...")
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
            | "producedQty"
            | "requestedQty"
        >,
        value: string
    ) => {
        
        setDrafts(current => {
            const existing = current[lineId];
            console.log(current[lineId]);
            console.log(value)
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
                    error: setLineErorr(
                        parseInt(value),
                        parseInt(existing.requestedQty)
                    ),
                    warning: setLineWarning(
                        parseInt(value),
                        parseInt(existing.requestedQty)
                    ),
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

        const producedQty =
            Number(draft.producedQty);

        const requestedQty =
            Number(draft.requestedQty);

        let validationError: string | undefined;
        let validationWarning: LineWarning | undefined;

        if (
            draft.producedQty === "" ||
            draft.requestedQty === ""
        ) {
            validationError =
                "Produced quantity is required.";
        } else if (
            !Number.isInteger(producedQty) ||
            !Number.isInteger(requestedQty)
        ) {
            validationError =
                "Quantities must be whole numbers.";
        } else if (requestedQty === 0) {
            validationError =
                "Requested quantity must be greater than zero.";
        } else if (producedQty === undefined ||
                    producedQty === null
        ) {
            validationError =
                "Produced quantity must be set.";
        } else if (
            producedQty > requestedQty
        ) {
            validationWarning = LineWarning.PRODUCESQTY_GREATER_THAN_REQUESTED
        } else if (
            producedQty < requestedQty
        ) {
            validationWarning = LineWarning.PRODUCESQTY_LESS_THAN_REQUESTED
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

        if (validationWarning) {
            setDrafts(current => ({
                ...current,

                [lineId]: {
                    ...current[lineId],
                    warning: validationWarning
                }
            }))
        }

        setDrafts(current => ({
            ...current,

            [lineId]: {
                ...current[lineId],
                saving: true,
                error: undefined,
                warning: validationWarning ?? undefined,
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
                            "RECORD_PRODUCTION",

                        producedQty,
                    }),
                }
            );

            const response = await res.json();
            //console.log(response);
            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to save Production. saveLine fetch"
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
                            : "Failed to save Production. setDraft callBack",
                },
            }));
        }
    };
    
    const hasUnsavedChanges =
        Object.values(drafts).some(
            draft => draft.dirty
        );
    
    const hasInValidProducedQty = 
        Object.values(drafts).some(
            draft => (
                draft.producedQty === null ||
                draft.producedQty === undefined ||
                draft.producedQty === ""
            )
        );

    const submitProduction = async () => {
        setFormError(null);

        if (hasUnsavedChanges) {
            setFormError(
                "You have unsaved Production changes. Save them before submitting."
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
                        action: "COMPLETE_PRODUCTION",
                    }),
                }
            );

            const response = await res.json();

            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to submit Production."
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
                    : "Failed to submit Production."
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <section className="rounded-xl border bg-white p-4 shadow">
                <p className="text-sm text-gray-600">
                    Loading Production...
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
    //console.log("R 1");
    return (
        
        <section className="rounded-xl border bg-white shadow">

            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">

                <div>
                    <h2 className="text-base font-semibold">
                        Record Production
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
            <div className="max-h-[60vh] overflow-auto text-gray-500">

                <table className="w-full border-collapse text-xs">

                    <thead className="sticky top-0 z-10 bg-gray-100">

                        <tr className="border-b">

                            <th className="whitespace-nowrap px-3 py-2 align-middle text-left font-medium">
                                Product
                            </th>
                           
                            <th className="whitespace-nowrap px-2 py-2 align-middle text-left font-medium">
                                Requested
                            </th>
                             
                            <th className="whitespace-nowrap px-2 py-2 align-middle text-left font-medium">
                                Produced
                            </th>

                            <th className="whitespace-nowrap px-3 py-2 align-middle text-left font-medium">
                                Actions
                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {request.lines.map(line => {
                            const draft =
                                drafts[line.id];
                            //console.log(draft);
                            if (!draft) {
                                return null;
                            }

                            const busy =
                                draft.saving ||
                                draft.deleting;
                            //console.log("R 2")
                            return (
                                
                                <tr
                                    key={line.id}
                                    className="border-b last:border-b-0 hover:bg-gray-50"
                                >

                                    {/* Product */}
                                    <td className="px-3 py-1.5">

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

                                    {/* Requested */}
                                    <td className="px-2 py-1.5">

                                        <input
                                            type="number"
                                            min="1"
                                            value={
                                                draft.requestedQty
                                            }
                                            disabled={
                                                true
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

                                    {/* Produced */}
                                    <td className="px-2 py-1.5">

                                        <input
                                            type="number"
                                            min="0"
                                            value={
                                                draft.producedQty
                                            }
                                            disabled={
                                                !capabilities?.canEdit ||
                                                busy
                                            }
                                            onChange={e => {
                                                console.log("Prod change!")
                                                updateDraft(
                                                    line.id,
                                                    "producedQty",
                                                    e.target.value
                                                )
                                            }
                                                
                                            }
                                            className="h-7 w-20 rounded border px-2 text-right text-xs outline-none focus:border-blue-500"
                                        />

                                    </td>


                                    {/* Actions */}
                                    <td className="px-3 py-1.5">

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

                                        </div>
                                            
                                            {draft.error && (
                                            <div className="mt-1 max-w-xs text-[10px] text-red-600">
                                                {draft.error}
                                            </div>
                                        )}

                                        {draft.warning && (!draft.error) && (
                                            <div className="mt-1 max-w-xs text-[10px] text-blue-600">
                                                {draft.warning}
                                            </div>
                                        )}
                                    </td>

                                </tr>
                            );
                        })}

                    </tbody>

                </table>

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
                    onClick={submitProduction}
                    disabled={
                        submitting ||
                        hasUnsavedChanges ||
                        !capabilities?.canEdit ||
                        hasInValidProducedQty
                    }
                    className="text-sm font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300"
                >
                    {submitting
                        ? "submitting..."
                        : "Submit Production"}
                </button>

            </div>

        </section>
    );
}

function setLineWarning(
    producedQty: number,
    requestedQty: number,
): LineWarning | undefined {
    if(producedQty > requestedQty){
        return LineWarning.PRODUCESQTY_GREATER_THAN_REQUESTED
    } else if(producedQty <  requestedQty){
        return LineWarning.PRODUCESQTY_LESS_THAN_REQUESTED
    };
    return undefined
}

function setLineErorr(
    producedQty: number,
    requestedQty: number,
){
    if(producedQty === null){
        return "Produced qty must be entered."
    }
}