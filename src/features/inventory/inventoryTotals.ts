import { amount, minor, invalid } from "../stock/stockValidation";
export type ProductInfo = { id: string; code: string; displayName: string; unit: string };
export type LocationInfo = { id: string; code: string; name: string; type: string; isActive: boolean };
export type TransitLine = { id: string; trackingNumber: number; type: "DELIVERY" | "RETURN"; productId: string; quantity: string; received: string; restored: string; sourceBranch: LocationInfo; destinationBranch: LocationInfo; businessDate: string };
export function transitOutstanding(line: TransitLine): bigint {
    const value = minor(line.quantity) - minor(line.received) - minor(line.restored);
    if (value < BigInt(0)) invalid("Transit totals are inconsistent. No quantities were changed.", 409);
    return value;
}
export function inventoryTotals(products: ProductInfo[], branches: LocationInfo[], balances: { branchId: string; productId: string; quantity: string }[], flows: TransitLine[], includeZero = false) {
    const locations = new Map(branches.map(branch => [branch.id, branch])), catalog = new Map(products.map(product => [product.id, product]));
    type Values = { onHand: bigint; incomingDelivery: bigint; incomingReturn: bigint; outgoingDelivery: bigint; outgoingReturn: bigint };
    const rows = new Map<string, Values & { branchId: string; productId: string }>();
    function row(branchId: string, productId: string) { const key = `${branchId}:${productId}`; if (!rows.has(key)) rows.set(key, { branchId, productId, onHand: BigInt(0), incomingDelivery: BigInt(0), incomingReturn: BigInt(0), outgoingDelivery: BigInt(0), outgoingReturn: BigInt(0) }); return rows.get(key)!; }
    if (includeZero) for (const branch of branches) for (const product of products) row(branch.id, product.id);
    for (const balance of balances) if (locations.has(balance.branchId) && catalog.has(balance.productId)) row(balance.branchId, balance.productId).onHand += minor(balance.quantity);
    const transit: (TransitLine & { outstanding: string; direction: string })[] = [], seen = new Set<string>(), unique = new Map<string, bigint>();
    for (const line of flows) {
        const key = `${line.type}:${line.id}:${line.productId}`;
        if (seen.has(key) || !catalog.has(line.productId)) continue;
        seen.add(key); const value = transitOutstanding(line), outgoing = locations.has(line.sourceBranch.id), incoming = locations.has(line.destinationBranch.id);
        if (value === BigInt(0) || (!outgoing && !incoming)) continue;
        if (outgoing) row(line.sourceBranch.id, line.productId)[line.type === "DELIVERY" ? "outgoingDelivery" : "outgoingReturn"] += value;
        if (incoming) row(line.destinationBranch.id, line.productId)[line.type === "DELIVERY" ? "incomingDelivery" : "incomingReturn"] += value;
        unique.set(line.productId, (unique.get(line.productId) ?? BigInt(0)) + value);
        transit.push({ ...line, outstanding: amount(value), direction: incoming && outgoing ? "WITHIN SELECTION" : incoming ? "INCOMING" : "OUTGOING" });
    }
    const items = [...rows.values()].filter(row => includeZero || [row.onHand, row.incomingDelivery, row.incomingReturn, row.outgoingDelivery, row.outgoingReturn].some(value => value !== BigInt(0))).map(value => {
        const product = catalog.get(value.productId)!, branch = locations.get(value.branchId)!;
        return { branchId: branch.id, branchCode: branch.code, locationType: branch.type, productId: product.id, code: product.code, displayName: product.displayName, unit: product.unit,
            onHand: amount(value.onHand), incoming: amount(value.incomingDelivery + value.incomingReturn), outgoing: amount(value.outgoingDelivery + value.outgoingReturn),
            incomingDelivery: amount(value.incomingDelivery), incomingReturn: amount(value.incomingReturn), outgoingDelivery: amount(value.outgoingDelivery), outgoingReturn: amount(value.outgoingReturn) };
    }).sort((a, b) => a.branchCode.localeCompare(b.branchCode) || a.code.localeCompare(b.code));
    const totals = products.map(product => { const selected = items.filter(row => row.productId === product.id); return { productId: product.id, code: product.code, displayName: product.displayName, unit: product.unit,
        onHand: amount(selected.reduce((value, row) => value + minor(row.onHand), BigInt(0))), incoming: amount(selected.reduce((value, row) => value + minor(row.incoming), BigInt(0))), outgoing: amount(selected.reduce((value, row) => value + minor(row.outgoing), BigInt(0))), uniqueTransit: amount(unique.get(product.id) ?? BigInt(0)) }; }).filter(row => includeZero || [row.onHand, row.incoming, row.outgoing, row.uniqueTransit].some(value => minor(value) > BigInt(0)));
    return { items, transit, totals };
}
