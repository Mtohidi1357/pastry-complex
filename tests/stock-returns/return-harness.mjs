import { fixture as stockFixture, load, validation, lease, inventory, manager, workshop, admin } from './stock-harness.mjs';
export { load, validation, lease, inventory, manager, workshop, admin };
export const salesInventory = { id: 'sales-inv', username: 'inventory-br01', roleCode: 'INV', branchId: 'BR01' };
export const otherInventory = { id: 'sales-inv2', username: 'inventory-br02', roleCode: 'INV', branchId: 'BR02' };
const clone = value => value === undefined ? null : structuredClone(value);
export function matches(row, where = {}) {
    if (!row) return false;
    return Object.entries(where).every(([key, value]) => value === undefined || (key === 'OR' ? value.some(item => matches(row, item)) : value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : value && typeof value === 'object' && 'notIn' in value ? !value.notIn.includes(row[key]) : value && typeof value === 'object' && 'not' in value ? row[key] !== value.not : value && typeof value === 'object' && 'is' in value ? matches(row[key], value.is) : row[key] === value));
}
export async function fixture() {
    const f = await stockFixture(); let serial = 0, key = 0;
    Object.assign(f.state, { returns: [], returnEvents: [], failReturnAudit: false });
    for (const user of [salesInventory, otherInventory]) f.state.users.push({ ...user, isActive: true, role: { code: user.roleCode } });
    f.state.balances.push({ branchId: 'BR01', productId: 'pcs', quantity: '20.000', revision: 1 });
    const location = id => clone(f.state.branches.find(branch => branch.id === id));
    const record = where => f.state.returns.find(row => matches(row, where));
    const view = item => ({ ...clone(item), sourceBranch: location(item.sourceBranchId), destinationBranch: location(item.destinationBranchId), createdBy: clone(f.state.users.find(user => user.id === item.createdById)), dispatchedBy: null, sourceRequest: clone(f.state.requests.find(req => req.id === item.sourceRequestId)),
        lines: item.lines.map(line => ({ ...clone(line), product: clone(f.state.products.find(p => p.id === line.productId)) })), events: f.state.returnEvents.filter(event => event.returnId === item.id).map(event => ({ ...clone(event), actor: clone(f.state.users.find(user => user.id === event.actorId)) })) });
    const models = {
        stockReturn: {
            findUnique: async ({ where, include }) => { const item = record(where); return item ? include ? view(item) : clone(item) : null; },
            findUniqueOrThrow: async ({ where }) => view(record(where)),
            findFirst: async ({ where }) => clone(f.state.returns.find(row => matches(row, where))),
            create: async ({ data }) => { if (record({ clientRequestId: data.clientRequestId })) throw Object.assign(Error('duplicate create'), { code: 'P2002' }); const item = { ...clone(data), id: 'return' + (++serial), trackingNumber: serial, status: 'DRAFT', version: 1, createdAt: clone(f.state.now), sourceRequestId: data.sourceRequestId ?? null, lines: data.lines.create.map(line => ({ ...line, receivedQuantity: '0.000', restoredQuantity: '0.000' })) }; f.state.returns.push(item); return clone(item); },
            update: async ({ where, data }) => { const item = record(where); for (const [field, value] of Object.entries(data)) item[field] = field === 'version' ? item.version + value.increment : field === 'lines' ? value.create.map(line => ({ ...line, receivedQuantity: '0.000', restoredQuantity: '0.000' })) : clone(value); return clone(item); },
            findMany: async ({ where, skip, take }) => f.state.returns.filter(item => matches(item, where)).slice(skip, skip + take).map(view), count: async ({ where }) => f.state.returns.filter(item => matches(item, where)).length,
        },
        stockReturnLine: {
            update: async ({ where, data }) => { const pair = where.returnId_productId, line = record({ id: pair.returnId }).lines.find(row => row.productId === pair.productId); Object.assign(line, data); return clone(line); },
            deleteMany: async ({ where }) => { record({ id: where.returnId }).lines = []; },
            findMany: async ({ where }) => f.state.returns.flatMap(item => item.lines.map(line => ({ ...clone(line), returnCase: view(item) }))).filter(row => matches(row, where)),
        },
        stockReturnEvent: { findUnique: async ({ where }) => clone(f.state.returnEvents.find(event => matches(event, where))), create: async ({ data }) => { if (f.state.failReturnAudit) throw Error('return audit failed'); if (data.clientRequestId && f.state.returnEvents.some(event => event.clientRequestId === data.clientRequestId)) throw Error('duplicate event'); const event = { id: 'return-event' + (++serial), createdAt: clone(f.state.now), ...clone(data) }; f.state.returnEvents.push(event); return clone(event); } },
    };
    Object.assign(f.tx, models); Object.assign(f.prisma, models);
    const query = f.tx.$queryRaw;
    f.tx.$queryRaw = async (strings, ...args) => strings.join('?').includes('stock_returns') ? record({ id: args[0] }) ? [{ id: args[0] }] : [] : query(strings, ...args);
    f.tx.workshopDeliveryLine.findMany = async ({ where }) => f.state.deliveries.flatMap(item => item.lines.map(line => ({ ...clone(line), delivery: { ...clone(item), sourceBranch: location(item.sourceBranchId), destinationBranch: location(item.destinationBranchId) } }))).filter(row => matches(row, where));
    f.tx.branchStockBalance.findMany = async ({ where }) => clone(f.state.balances.filter(row => matches(row, where)));
    f.tx.stockMovement.findMany = async ({ where, skip = 0, take = 100000 }) => f.state.movements.filter(row => matches(row, where)).slice(skip, skip + take).map(row => ({ ...clone(row), branch: location(row.branchId), product: clone(f.state.products.find(product => product.id === row.productId)), actor: clone(f.state.users.find(user => user.id === row.actorId)), stockReturn: row.returnId ? view(record({ id: row.returnId })) : null, delivery: null, stockCount: null, receipt: null, workshopReceipt: null }));
    f.tx.stockMovement.count = async ({ where }) => f.state.movements.filter(row => matches(row, where)).length;
    const requestFind = f.tx.dailyRequest.findUnique;
    f.tx.dailyRequest.findMany = async ({ where }) => f.state.requests.map(req => ({ ...clone(req), stockReceipt: clone(f.state.receipts.find(receipt => receipt.sourceRequestId === req.id)) })).filter(req => matches(req, where));
    f.tx.dailyRequest.findUnique = requestFind;
    const receiptFind = f.tx.stockReceipt.findUnique;
    f.tx.stockReceipt.findUnique = async args => { const receipt = await receiptFind(args); return receipt ? { ...receipt, lines: Array.isArray(receipt.lines) ? receipt.lines : receipt.lines.create } : null; };
    const policy = await load('src/features/returns/returnPolicy.ts');
    const quantities = await load('src/features/returns/returnQuantities.ts', { '../stock/stockValidation': validation });
    const service = await load('src/features/returns/returnService.ts', { '@/lib/prisma': { prisma: f.prisma }, '../stock/stockValidation': validation, '../stock/documentLease': lease, '@/lib/trackingCode': await load('src/lib/trackingCode.ts'), './returnPolicy': policy, './returnQuantities': quantities });
    const totals = await load('src/features/inventory/inventoryTotals.ts', { '../stock/stockValidation': validation });
    const monitor = await load('src/features/inventory/inventoryService.ts', { '@/lib/prisma': { prisma: f.prisma }, '../stock/stockValidation': validation, '../returns/returnPolicy': policy, './inventoryTotals': totals });
    const body = (quantity = '8') => ({ clientRequestId: 'return-create' + (++key), destinationBranchId: 'WS01', businessDate: '2030-01-01', condition: 'SALEABLE', note: 'Saleable surplus returned', lines: [{ productId: 'pcs', quantity }] });
    const acquire = (item, user = salesInventory, token = 'editor') => service.returnLease(user, item.id, token, 'acquire');
    const release = (item, user, token = 'editor') => service.returnLease(user, item.id, token, 'release');
    const act = (item, action, user = salesInventory, lines, extra = {}) => service.actOnReturn(user, item.id, action, { version: item.version, clientRequestId: 'return-action' + (++key), condition: 'SALEABLE', reason: 'Checked physical saleable goods', ...(lines ? { lines } : {}), ...extra }, 'editor');
    async function submitted(input = body()) { let item = await service.createReturn(salesInventory, input); await acquire(item); item = await act(item, 'submit'); await release(item, salesInventory); return item; }
    async function dispatched(input = body()) { const item = await submitted(input); await acquire(item, manager); const result = await act(item, 'dispatch', manager); await release(result, manager); return result; }
    function receivedRequest(quantity = '10', withDelivery = false) { const req = { id: 'received-req', trackingNumber: 9, branchId: 'BR01', deletedAt: null, status: 'CLOSED', lines: [] }; f.state.requests.push(req); f.state.receipts.push({ id: 'original-receipt', sourceRequestId: req.id, branchId: 'BR01', status: 'CONFIRMED', lines: [{ productId: 'pcs', quantity }] }); f.state.productions.push({ id: 'original-production', sourceRequestId: req.id, branchId: 'WS01', status: 'POSTED' }); if (withDelivery) f.state.deliveries.push({ id: 'original-delivery', trackingNumber: 1, sourceRequestId: req.id, sourceBranchId: 'WS01', destinationBranchId: 'BR01', status: 'RECEIVED', businessDate: new Date('2030-01-01'), lines: [{ productId: 'pcs', quantity, receivedQuantity: quantity, returnedQuantity: '0.000' }] }); return req; }
    return { ...f, returns: service, quantities, monitor, totals, body, acquire, release, act, submitted, dispatchedReturn: dispatched, receivedRequest };
}
