export interface CreateLineDTO {
    productId: string,
    requestedQty: number,
    prevBalance: number,
    currentBalance: number,
}

export interface DailyRequestLineView {
    id: string,
    productId: string,
    requestedQty: number,
    producedQty: number,
    variance: number,
}

export interface RecordInventoryDTO {
    previousBalance: number;
    currentBalance: number;
    requestedQty: number;
}

export interface RecordRequestDTO {
    requestedQty: number;
}

export interface RecordProductionDTO {
    producedQty: number;
}

export interface RecordReceivingDTO {
    receivedQty: number;
}