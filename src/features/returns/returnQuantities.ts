import { amount, invalid, minor } from "../stock/stockValidation";
export type ReturnAmounts = { productId: string; quantity: string; receivedQuantity: string; restoredQuantity: string };
export function returnOutstanding(line: ReturnAmounts): bigint {
    const value = minor(line.quantity) - minor(line.receivedQuantity) - minor(line.restoredQuantity);
    if (value < BigInt(0)) invalid("Return totals are inconsistent. No changes were made.", 409);
    return value;
}
export function allocateReturn(lines: ReturnAmounts[], input: { productId: string; quantity: string }[]) {
    if (!input.length || input.length > 200 || new Set(input.map(line => line.productId)).size !== input.length) invalid("Enter distinct return products.");
    const values = input.map(row => {
        const line = lines.find(item => item.productId === row.productId), quantity = minor(row.quantity);
        if (!line || quantity > returnOutstanding(line)) invalid("Quantity exceeds this product's outstanding return transit.", 409);
        return { productId: row.productId, quantity: amount(quantity) };
    }).filter(line => minor(line.quantity) > BigInt(0)).sort((a, b) => a.productId.localeCompare(b.productId));
    if (!values.length) invalid("Enter at least one positive quantity.");
    return values;
}
export function returnStatus(lines: ReturnAmounts[]): "DISPATCHED" | "RECEIVED" | "RESTORED" | "RESOLVED" {
    if (lines.some(line => returnOutstanding(line) > BigInt(0))) return "DISPATCHED";
    if (lines.every(line => minor(line.restoredQuantity) === BigInt(0))) return "RECEIVED";
    if (lines.every(line => minor(line.receivedQuantity) === BigInt(0))) return "RESTORED";
    return "RESOLVED";
}
