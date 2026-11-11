import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
export class AppError extends Error { constructor(code, message, status = 400) { super(message); Object.assign(this, { code, status }); } }
class PermissionDeniedError extends AppError { constructor(message) { super('PERMISSION_DENIED', message, 403); } }
const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
const codes = { VALIDATION_ERROR: 'VALIDATION_ERROR', NOT_FOUND: 'NOT_FOUND', EDIT_LEASE_CONFLICT: 'EDIT_LEASE_CONFLICT' };
const common = { '@/errors/AppError': { AppError }, '@/errors/PermissionDeniedError': { PermissionDeniedError }, '@/types/api': { ApiErrorCode: codes }, 'node:crypto': { createHash }, zod: { z: chain }, '@/lib/listVisibility': { showFinishedQuery: chain } };
export async function load(file, mocks = {}) {
    const testModule = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL(file, root), 'utf8'), { mode: 'transform' }), { identifier: file });
    await testModule.link(name => { const values = mocks[name] ?? common[name]; if (!values) throw new Error('Missing mock: ' + name + ' in ' + file); return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }); });
    await testModule.evaluate(); return testModule.namespace;
}
export const validation = await load('src/features/stock/stockValidation.ts');
export const quantity = await load('src/features/delivery/deliveryQuantities.ts', { '../stock/stockValidation': validation });
export const lease = await load('src/features/stock/documentLease.ts');
export const inventory = { id: 'inv-ws01', username: 'inventory01', roleCode: 'INV', branchId: 'WS01' };
export const inventory2 = { id: 'inv-ws02', username: 'inventory02', roleCode: 'INV', branchId: 'WS02' };
export const manager = { id: 'bm1', username: 'manager01', roleCode: 'BM', branchId: 'BR01' };
export const manager2 = { id: 'bm2', username: 'manager02', roleCode: 'BM', branchId: 'BR02' };
export const workshop = { id: 'wm1', username: 'workshop01', roleCode: 'WM', branchId: 'WS01' };
export const admin = { id: 'admin', username: 'admin', roleCode: 'ADMIN', branchId: 'BR01' };
const clone = value => value === undefined ? null : structuredClone(value);
function matches(row, where = {}) {
    if (!row) return false;
    return Object.entries(where).every(([key, value]) => value === undefined || (key === 'OR' ? value.some(item => matches(row, item)) : value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : value && typeof value === 'object' && 'is' in value ? matches(row[key], value.is) : row[key] === value));
}
export async function fixture() {
    let serial = 0, tail = Promise.resolve();
    const actors = [inventory, inventory2, manager, manager2, workshop, admin];
    const state = { now: new Date('2030-01-01T00:00:00.000Z'), deliveries: [], events: [], leases: [], balances: [{ branchId: 'WS01', productId: 'pcs', quantity: '20.000', revision: 1 }], movements: [], requests: [], productions: [], receipts: [], history: [], failMovement: false, failAudit: false, failClose: false,
        branches: ['WS01', 'WS02', 'BR01', 'BR02'].map(id => ({ id, code: id, type: id.startsWith('WS') ? 'BAKERY' : 'SALES', name: id, isActive: true })),
        users: actors.map(user => ({ ...user, isActive: true, role: { code: user.roleCode } })), products: [{ id: 'pcs', code: 'P01', displayName: 'Cake', unit: 'PCS', isActive: true }, { id: 'kg', code: 'P02', displayName: 'Cream', unit: 'KG', isActive: true }] };
    const locks = [];
    const record = where => state.deliveries.find(row => matches(row, where));
    function view(item) {
        return { ...clone(item), sourceBranch: clone(state.branches.find(row => row.id === item.sourceBranchId)), destinationBranch: clone(state.branches.find(row => row.id === item.destinationBranchId)), createdBy: clone(state.users.find(row => row.id === item.createdById)), dispatchedBy: null,
            sourceRequest: clone(state.requests.find(row => row.id === item.sourceRequestId)), lines: item.lines.map(line => ({ ...clone(line), product: clone(state.products.find(row => row.id === line.productId)) })), events: state.events.filter(row => row.deliveryId === item.id).map(event => ({ ...clone(event), actor: clone(state.users.find(row => row.id === event.actorId)) })) };
    }
    const tx = {
        $queryRaw: async (strings, ...args) => {
            const sql = strings.join('?'); locks.push({ sql, args });
            if (sql.includes('CURRENT_TIMESTAMP')) return [{ now: clone(state.now) }];
            const rows = sql.includes('branches') ? state.branches : sql.includes('daily_requests') ? state.requests : sql.includes('workshop_receipts') ? state.productions : state.deliveries;
            return rows.some(row => row.id === args[0]) ? [{ id: args[0] }] : [];
        },
        user: { findFirst: async ({ where }) => clone(state.users.find(row => matches(row, where))) },
        branch: { findUnique: async ({ where }) => clone(state.branches.find(row => matches(row, where))), findMany: async ({ where }) => clone(state.branches.filter(row => matches(row, where))) },
        product: { findMany: async ({ where }) => clone(state.products.filter(row => matches(row, where))) },
        dailyRequest: { findUnique: async ({ where }) => { const row = state.requests.find(row => matches(row, where)); return row ? { ...clone(row), workshopReceipt: clone(state.productions.find(p => p.sourceRequestId === row.id)) } : null; },
            findMany: async () => [], update: async ({ where, data }) => { if (state.failClose) throw Error('close failed'); const row = state.requests.find(row => matches(row, where)); Object.assign(row, data); return clone(row); } },
        workshopReceipt: { findUnique: async ({ where }) => clone(state.productions.find(row => matches(row, where))) },
        workshopDelivery: {
            findUnique: async ({ where, include }) => { const row = record(where); return row ? include ? view(row) : clone(row) : null; },
            findUniqueOrThrow: async ({ where }) => { const row = record(where); if (!row) throw Error('missing'); return view(row); },
            create: async ({ data }) => { if (state.deliveries.some(row => row.clientRequestId === data.clientRequestId || data.sourceRequestId && row.sourceRequestId === data.sourceRequestId)) throw Object.assign(Error('duplicate'), { code: 'P2002' }); const row = { ...clone(data), id: 'dlv' + (++serial), trackingNumber: serial, version: 1, status: 'DRAFT', sourceRequestId: data.sourceRequestId ?? null, lines: data.lines.create.map(line => ({ ...line, receivedQuantity: '0.000', returnedQuantity: '0.000' })) }; state.deliveries.push(row); return clone(row); },
            update: async ({ where, data }) => { const row = record(where); for (const [key, value] of Object.entries(data)) row[key] = key === 'version' ? row.version + value.increment : value; return clone(row); },
            findMany: async ({ where, skip, take }) => state.deliveries.filter(row => matches(row, where)).slice(skip, skip + take).map(view), count: async ({ where }) => state.deliveries.filter(row => matches(row, where)).length,
        },
        workshopDeliveryLine: { update: async ({ where, data }) => { const key = where.deliveryId_productId, row = record({ id: key.deliveryId }).lines.find(line => line.productId === key.productId); Object.assign(row, data); return clone(row); } },
        workshopDeliveryEvent: { findUnique: async ({ where }) => clone(state.events.find(row => matches(row, where))), create: async ({ data }) => { if (state.failAudit) throw Error('audit failed'); if (data.clientRequestId && state.events.some(row => row.clientRequestId === data.clientRequestId)) throw Error('duplicate event token'); const row = { ...clone(data), id: 'event' + (++serial), createdAt: clone(state.now) }; state.events.push(row); return clone(row); } },
        stockDocumentLease: { findUnique: async ({ where }) => clone(state.leases.find(row => matches(row, where))), upsert: async ({ where, create, update }) => { let row = state.leases.find(row => matches(row, where)); if (!row) { row = clone(create); state.leases.push(row); } else Object.assign(row, clone(update)); return clone(row); }, deleteMany: async ({ where }) => { state.leases = state.leases.filter(row => !matches(row, where)); } },
        branchStockBalance: { findUnique: async ({ where }) => clone(state.balances.find(row => matches(row, where.branchId_productId))), upsert: async ({ where, create, update }) => { let row = state.balances.find(row => matches(row, where.branchId_productId)); if (!row) { row = clone(create); state.balances.push(row); } else { row.quantity = update.quantity; if (update.revision?.increment) row.revision += update.revision.increment; } return clone(row); } },
        stockMovement: { create: async ({ data }) => { if (state.failMovement || state.failMovementAfter !== undefined && state.movements.length >= state.failMovementAfter) throw Error('movement failed'); if (state.movements.some(row => row.sourceKey === data.sourceKey)) throw Error('duplicate movement'); const row = { id: 'movement' + (++serial), ...clone(data) }; state.movements.push(row); return clone(row); } },
        stockReceipt: { findUnique: async ({ where }) => clone(state.receipts.find(row => matches(row, where))), create: async ({ data }) => { const row = { id: 'receipt' + (++serial), ...clone(data) }; state.receipts.push(row); return clone(row); } },
    };
    const prisma = { ...tx, $transaction: async operation => { const previous = tail; let unlock; tail = new Promise(resolve => { unlock = resolve; }); await previous; const snapshot = clone(state); try { return await operation(tx); } catch (error) { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, snapshot); throw error; } finally { unlock(); } } };
    const tracking = await load('src/lib/trackingCode.ts');
    const service = await load('src/features/delivery/deliveryService.ts', { '@/lib/prisma': { prisma }, '../stock/stockValidation': validation, '../stock/documentLease': lease, '@/lib/trackingCode': tracking, './deliveryQuantities': quantity });
    const link = await load('src/features/delivery/requestDeliveryReceiving.ts', { '../stock/stockValidation': validation, './deliveryQuantities': quantity });
    const posting = await load('src/features/stock/stockPosting.ts', { './stockValidation': validation });
    const requestReceiving = await load('src/features/stock/requestReceiving.ts', { './stockValidation': validation, './stockPosting': posting, '../delivery/requestDeliveryReceiving': link });
    let key = 0;
    const input = (quantity = '10') => ({ clientRequestId: 'create' + (++key), destinationBranchId: 'BR01', businessDate: '2030-01-01', note: 'Checked workshop shipment', lines: [{ productId: 'pcs', quantity }] });
    const action = (item, name, rows, user = inventory, overrides = {}) => service.deliveryAction(user, item.id, name, { version: item.version, clientRequestId: 'action' + (++key), reason: 'Checked physical goods', ...(rows ? { lines: rows } : {}), ...overrides }, 'editor');
    async function acquire(item, user = inventory, token = 'editor') { await service.deliveryLease(user, item.id, token, 'acquire'); }
    async function switchUser(item, user) { await service.deliveryLease(inventory, item.id, 'editor', 'release'); await acquire(item, user); }
    async function dispatched(body = input()) { const item = await service.createDelivery(inventory, body); await acquire(item); return action(item, 'dispatch'); }
    function request() { const row = { id: 'req1', trackingNumber: 1, status: 'COMPLETED', assignedToId: manager.id, deletedAt: null, branchId: 'BR01', businessDate: new Date('2030-01-01'), lines: [{ productId: 'pcs', producedQty: 10, receivedQty: 9 }] }; state.requests.push(row); state.productions.push({ id: 'production1', sourceRequestId: row.id, branchId: 'WS01', status: 'POSTED' }); return row; }
    return { state, prisma, tx, service, lease, quantity, requestReceiving, input, action, acquire, switchUser, dispatched, request, locks, balance: (branch = 'WS01', product = 'pcs') => state.balances.find(row => row.branchId === branch && row.productId === product)?.quantity ?? '0.000' };
}
