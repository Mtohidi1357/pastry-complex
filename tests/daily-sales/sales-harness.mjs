import { fixture, load, validation, lease } from './stock-harness.mjs';
export const inv = { id: 'inv-br01', username: 'inventory-br01', roleCode: 'INV', branchId: 'BR01' };
export const other = { id: 'inv-br02', username: 'inventory-br02', roleCode: 'INV', branchId: 'BR02' };
export const manager = { id: 'bm1', username: 'manager01', roleCode: 'BM', branchId: 'BR01' };
export const admin = { id: 'admin', username: 'admin', roleCode: 'ADMIN', branchId: 'BR01' };
const copy = value => value == null ? value : structuredClone(value);
function matches(row, where = {}) {
    return row && Object.entries(where).every(([key, value]) => value === undefined || (value instanceof Date ? row[key]?.getTime() === value.getTime() : value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value));
}
export async function salesFixture() {
    const f = await fixture(), { state, tx, prisma } = f; let serial = 0;
    state.days = []; state.reports = []; state.salesEvents = [];
    state.users.push(...[inv, other].map(user => ({ ...user, isActive: true, role: { code: user.roleCode } })));
    state.balances.push({ branchId: 'BR01', productId: 'pcs', quantity: '20.000', revision: 1 }, { branchId: 'BR01', productId: 'kg', quantity: '2.000', revision: 1 });
    const query = tx.$queryRaw;
    tx.$queryRaw = async (strings, ...args) => strings.join('?').includes('sales_reports') ? state.reports.some(row => row.id === args[0]) ? [{ id: args[0] }] : [] : query(strings, ...args);
    function view(row) { return { ...copy(row), branch: copy(state.branches.find(b => b.id === row.branchId)), createdBy: copy(state.users.find(u => u.id === row.createdById)), postedBy: null, reversedBy: null, corrects: copy(state.reports.find(r => r.id === row.correctsReportId)) ?? null, corrections: copy(state.reports.filter(r => r.correctsReportId === row.id)), lines: row.lines.map(line => ({ ...copy(line), product: copy(state.products.find(p => p.id === line.productId)) })), events: state.salesEvents.filter(e => e.reportId === row.id).map(e => ({ ...copy(e), actor: copy(state.users.find(u => u.id === e.actorId)) })) }; }
    const models = {
        salesDay: {
            upsert: async ({ where, create }) => { let row = state.days.find(r => matches(r, where.branchId_businessDate)); if (!row) { row = { id: 'day' + ++serial, activeReportId: null, ...copy(create) }; state.days.push(row); } return copy(row); },
            update: async ({ where, data }) => { const row = state.days.find(r => matches(r, where)); Object.assign(row, copy(data)); return copy(row); },
            findUniqueOrThrow: async ({ where }) => { const row = state.days.find(r => matches(r, where)); if (!row) throw Error('Day missing'); return copy(row); },
        },
        salesReport: {
            findUnique: async ({ where, include }) => { const row = state.reports.find(r => matches(r, where)); return row ? include ? view(row) : copy(row) : null; },
            findUniqueOrThrow: async ({ where }) => { const row = state.reports.find(r => matches(r, where)); if (!row) throw Error('Report missing'); return view(row); },
            create: async ({ data }) => { const row = { id: 'sales' + ++serial, trackingNumber: serial, status: 'DRAFT', version: 1, createdAt: copy(state.now), ...copy(data), lines: copy(data.lines.create) }; if (state.reports.some(r => r.clientRequestId === row.clientRequestId)) throw Error('duplicate create'); state.reports.push(row); return copy(row); },
            update: async ({ where, data }) => { const row = state.reports.find(r => matches(r, where)); for (const [key, value] of Object.entries(data)) row[key] = key === 'version' ? row.version + value.increment : key === 'lines' ? copy(value.create) : copy(value); return copy(row); },
            findMany: async ({ where, skip = 0, take = 20 }) => state.reports.filter(r => matches(r, where)).slice(skip, skip + take).map(view), count: async ({ where }) => state.reports.filter(r => matches(r, where)).length,
        },
        salesReportLine: { deleteMany: async ({ where }) => { state.reports.find(r => r.id === where.reportId).lines = []; } },
        salesReportEvent: {
            findUnique: async ({ where }) => copy(state.salesEvents.find(r => matches(r, where))),
            create: async ({ data }) => { if (state.failAudit) throw Error('audit failed'); if (data.clientRequestId && state.salesEvents.some(r => r.clientRequestId === data.clientRequestId)) throw Error('duplicate event'); const row = { id: 'event' + ++serial, createdAt: copy(state.now), ...copy(data) }; state.salesEvents.push(row); return copy(row); },
        },
    };
    Object.assign(tx, models); Object.assign(prisma, models); tx.stockMovement.findMany = async ({ where }) => copy(state.movements.filter(r => matches(r, where)));
    const tracking = await load('src/lib/trackingCode.ts');
    const policy = await load('src/features/sales/salesPolicy.ts');
    const service = await load('src/features/sales/salesService.ts', { '@/lib/prisma': { prisma }, '../stock/stockValidation': validation, '../stock/documentLease': lease, '@/lib/trackingCode': tracking, './salesPolicy': policy });
    let token = 0;
    const input = (quantity = '5', overrides = {}) => ({ clientRequestId: 'create' + ++token, businessDate: '2030-01-01', note: 'Checked daily sales totals', lines: [{ productId: 'pcs', quantity }], ...overrides });
    const acquire = (item, user = inv, editor = 'editor') => service.salesLease(user, item.id, editor, 'acquire');
    const actionInput = item => ({ version: item.version, clientRequestId: 'op' + ++token, reason: 'Checked and verified daily sales' });
    const action = (item, name, user = inv, body = actionInput(item), editor = 'editor') => service.actOnSales(user, item.id, name, body, editor);
    async function submitted(body = input()) { const item = await service.createSales(inv, body); await acquire(item); const next = await action(item, 'submit'); await service.salesLease(inv, item.id, 'editor', 'release'); await acquire(next, manager); return next; }
    async function posted(body = input()) { return action(await submitted(body), 'post', manager); }
    return { ...f, service, input, acquire, actionInput, action, submitted, posted, balance: (product = 'pcs') => state.balances.find(b => b.branchId === 'BR01' && b.productId === product)?.quantity };
}
