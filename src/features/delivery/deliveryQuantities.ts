import { amount, invalid, minor } from "../stock/stockValidation";
export type DeliveryAmounts = { productId: string; quantity: string; receivedQuantity: string; returnedQuantity: string };
export function outstanding(line: DeliveryAmounts): bigint {
    const value = minor(line.quantity) - minor(line.receivedQuantity) - minor(line.returnedQuantity);
    if (value < BigInt(0)) invalid("Delivery quantities are inconsistent. No changes were made.", 409);
    return value;
}
export function allocation(lines: DeliveryAmounts[], input: { productId: string; quantity: string }[]) {
    if (!input.length || input.length > 200 || new Set(input.map(line => line.productId)).size !== input.length) invalid("Enter distinct delivery products.");
    const result = input.map(row => {
        const line = lines.find(item => item.productId === row.productId), quantity = minor(row.quantity);
        if (!line) invalid("This product does not belong to the delivery.", 409);
        if (quantity > outstanding(line)) invalid("Quantity exceeds the goods still in transit. Refresh the delivery before continuing.", 409);
        return { productId: row.productId, quantity: amount(quantity) };
    }).sort((a, b) => a.productId.localeCompare(b.productId));
    if (!result.some(row => minor(row.quantity) > BigInt(0))) invalid("Enter at least one positive quantity.");
    return result.filter(row => minor(row.quantity) > BigInt(0));
}
export function deliveryStatus(lines: DeliveryAmounts[]): "DISPATCHED" | "RECEIVED" | "RETURNED" | "RESOLVED" {
    if (lines.some(line => outstanding(line) > BigInt(0))) return "DISPATCHED";
    if (lines.every(line => minor(line.returnedQuantity) === BigInt(0))) return "RECEIVED";
    if (lines.every(line => minor(line.receivedQuantity) === BigInt(0))) return "RETURNED";
    return "RESOLVED";
}
