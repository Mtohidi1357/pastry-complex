"use client";

import { useCallback, useEffect, useState } from "react";

type Product = {
    id: string;
    code: string;
    name: string;
    displayName: string;
};

type ReceivingLine = {
    id: string;
    productId: string;
    producedQty: number;
    requestedQty: number | null;
    receivedQty: number | null;
    product: Product;
};

type RequestCapabilities = {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canRestore: boolean;
    availableActions: string[];
};

type ReceivingRequest = {
    id: string;
    businessDate: string;
    status: string;
    lines: ReceivingLine[];
};

type LineDraft = {
    receivingQty:string;
    producedQty: string;
    requestedQty: string;
    dirty: boolean;
    saving: boolean;
    deleting: boolean;
    saved: boolean;
    error?: LineError | String;
    warning?: LineWarning;
};

type ReceivingFormProps = {
    requestId: string;
    token: string;
    onClose: () => void;
    onSaved?: () => void;
    onSubmitted: () => void;
};

enum LineWarning {
    RECEIVEDQTY_LESS_THAN_PRODUCED = "RECEIVEDQTY_LESS_THAN_PRODUCED",
    RECEIVING_ZERO = "RECEIVING_ZERO"
}

enum LineError {
    RECEIVEDQTY_GREATER_THAN_PRODUCED = "RECEIVEDQTY_GREATER_THAN_PRODUCED",
    RECEIVEDQTY_NOT_SET = "RECEIVEDQTY_NOT_SET",
    RECEIVEDQTY_NOT_A_WHOLE_NUMBER = "Receiving qty must be a whole positive number.",
    SAVING_FAILED = "Failed to save Receiving."
}

export default function ReceivingForm({
    requestId,
    token,
    onClose,
    onSaved,
}: ReceivingFormProps) {
    const [request, setRequest] =
        useState<ReceivingRequest | null>(null);

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
                    receivingQty:
                        String(
                            line.receivedQty ?? ""
                        ),

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
                    warning: setLineWarning(
                        line.receivedQty,
                        line.producedQty
                    ),
                    error: setLineError(
                        line.receivedQty,
                        line.producedQty,
                    )
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
            | "receivingQty"
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
                    error: setLineError(
                        parseInt(value),
                        parseInt(existing.producedQty)
                    ),
                    warning: setLineWarning(
                        parseInt(value),
                        parseInt(existing.producedQty)
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
        
        const receivedQty = 
            Number(draft.receivingQty);

        let validationError: LineError | undefined;
        let validationWarning: LineWarning | undefined;

        if (
            draft.receivingQty === "" 
        ) {
            validationError =
                LineError.RECEIVEDQTY_NOT_SET;
        } else if (
            !Number.isInteger(receivedQty)
        ) {
            validationError =
                LineError.RECEIVEDQTY_NOT_A_WHOLE_NUMBER;
        } else if (receivedQty === 0) {
            validationWarning = LineWarning.RECEIVING_ZERO;
        } else if (receivedQty === undefined ||
                    receivedQty === null
        ) {
            validationError = LineError.RECEIVEDQTY_NOT_SET;
        } else if (
            producedQty > receivedQty
        ) {
            validationWarning = LineWarning.RECEIVEDQTY_LESS_THAN_PRODUCED
        } else if (
            producedQty < receivedQty
        ) {
            validationError = LineError.RECEIVEDQTY_GREATER_THAN_PRODUCED
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
                            "RECORD_RECEIVEDQTY",

                        receivedQty,
                    }),
                }
            );

            const response = await res.json();
            //console.log(response);
            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to save Receiving. saveLine fetch"
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
                            : LineError.SAVING_FAILED,
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
                draft.receivingQty === null ||
                draft.receivingQty === undefined ||
                draft.receivingQty === ""
            )
        );

    const submitReceiving = async () => {
        setFormError(null);

        if (hasUnsavedChanges) {
            setFormError(
                "You have unsaved Receiving changes. Save them before submitting."
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
                        action: "CLOSE_REQUEST",
                    }),
                }
            );

            const response = await res.json();

            if (!res.ok || !response.success) {
                throw new Error(
                    response.message ??
                    "Failed to submit Receiving."
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
                    : "Failed to submit Receiving."
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <section className="rounded-xl border bg-white p-4 shadow">
                <p className="text-sm text-gray-600">
                    Loading Receiving...
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
                        Record Receiving
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

                            <th className="whitespace-nowrap px-2 py-2 align-middle text-left font-medium">
                                Received
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
                                                true
                                            }
                                            className="h-7 w-20 rounded border px-2 text-right text-xs outline-none focus:border-blue-500"
                                        />

                                    </td>

                                    {/* Received */}
                                    <td className="px-2 py-1.5">

                                        <input
                                            type="number"
                                            min="0"
                                            value={
                                                draft.receivingQty
                                            }
                                            disabled={
                                                !capabilities?.canEdit ||
                                                busy
                                            }
                                            onChange={e => {
                                                console.log("Rec change!")
                                                updateDraft(
                                                    line.id,
                                                    "receivingQty",
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
                    onClick={submitReceiving}
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
                        : "Submit Receiving"}
                </button>

            </div>

        </section>
    );
}

function setLineWarning(
    receivedQty: number,
    producedQty: number,
): LineWarning | undefined {
    if(producedQty > receivedQty){
        return LineWarning.RECEIVEDQTY_LESS_THAN_PRODUCED
    };
    return undefined
}

function setLineError(
    receivedQty: number,
    producedQty: number,
): LineError | undefined{
    if(receivedQty === null || receivedQty === undefined || !receivedQty){
        return LineError.RECEIVEDQTY_NOT_SET
    } else if(receivedQty > producedQty){
        return LineError.RECEIVEDQTY_GREATER_THAN_PRODUCED
    } else if(receivedQty < 0 || !Number.isInteger(receivedQty)){
        return LineError.RECEIVEDQTY_NOT_A_WHOLE_NUMBER
    } else {
        return undefined
    }
}