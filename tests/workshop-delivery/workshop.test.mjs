import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, load, validation, lease, inventory, workshop } from './harness.mjs';
async function productionFixture() {
    const f = await fixture(); f.state.workshopEvents = []; let serial = 0;
    const clone = value => structuredClone(value), row = id => f.state.productions.find(item => item.id === id);
    const view = item => ({ ...clone(item), branch: f.state.branches.find(b => b.id === item.branchId), lines: item.lines.map(line => ({ ...line, product: f.state.products.find(p => p.id === line.productId) })), events: f.state.workshopEvents.filter(event => event.receiptId === item.id), sourceRequest: null });
    Object.assign(f.tx.workshopReceipt, {
        findUnique: async ({ where, include }) => { const item = row(where.id); return item ? include ? view(item) : clone(item) : null; },
        findUniqueOrThrow: async ({ where }) => view(row(where.id)),
        create: async ({ data }) => { const item = { ...clone(data), id: 'production' + (++serial), trackingNumber: serial, version: 1, status: 'DRAFT', lines: clone(data.lines.create) }; f.state.productions.push(item); return clone(item); },
        update: async ({ where, data }) => { const item = row(where.id); for (const [key, value] of Object.entries(data)) item[key] = key === 'version' ? item.version + value.increment : key === 'lines' ? clone(value.create) : value; return clone(item); },
    });
    f.tx.workshopReceiptLine = { deleteMany: async ({ where }) => { row(where.receiptId).lines = []; } };
    f.tx.workshopReceiptEvent = { create: async ({ data }) => { const event = { ...clone(data), id: 'event' + (++serial) }; f.state.workshopEvents.push(event); return event; } };
    Object.assign(f.prisma, { workshopReceiptLine: f.tx.workshopReceiptLine, workshopReceiptEvent: f.tx.workshopReceiptEvent });
    f.tx.stockMovement.findFirst = async ({ where }) => f.state.movements.find(item => Object.entries(where).every(([key, value]) => item[key] === value)) ?? null;
    const policy = await load('src/features/workshop/workshopPolicy.ts');
    const posting = await load('src/features/workshop/workshopPosting.ts', { '../stock/stockValidation': validation, './workshopPolicy': policy });
    const service = await load('src/features/workshop/workshopService.ts', { '@/lib/prisma': { prisma: f.prisma }, '../stock/stockValidation': validation, '../stock/documentLease': lease, '@/lib/trackingCode': await load('src/lib/trackingCode.ts'), './workshopPolicy': policy, './workshopPosting': posting });
    const body = { clientRequestId: 'manual-one', sourceType: 'MANUAL_PRODUCTION', businessDate: '2030-01-01', note: 'Verified independent batch', lines: [{ productId: 'pcs', quantity: '5' }] };
    return { ...f, production: service, body };
}
test('workshop draft acquisition blocks another tab and all saves require its token', async () => {
    const f = await productionFixture(), item = await f.production.createWorkshop(workshop, f.body);
    await f.production.workshopLease(workshop, item.id, 'tab-one', 'acquire');
    await assert.rejects(f.production.workshopLease(workshop, item.id, 'tab-two', 'acquire'), error => error.code === 'EDIT_LEASE_CONFLICT' && /another tab/.test(error.message));
    await assert.rejects(f.production.saveWorkshop(workshop, item.id, { ...f.body, version: 1 }), { status: 409 });
    const saved = await f.production.saveWorkshop(workshop, item.id, { ...f.body, lines: [{ productId: 'pcs', quantity: '6' }], version: 1 }, 'tab-one');
    assert.equal(saved.version, 2); assert.equal(f.balance(), '20.000');
    await assert.rejects(f.production.saveWorkshop(workshop, item.id, { ...f.body, version: 1 }, 'tab-one'), { status: 409 });
    await f.production.workshopLease(workshop, item.id, 'tab-one', 'release');
    const next = await f.production.workshopLease(workshop, item.id, 'tab-two', 'acquire'); assert.equal(next.version, 2);
});
test('production posting keeps its existing stock effect and cannot bypass another editor', async () => {
    const f = await productionFixture(), item = await f.production.createWorkshop(workshop, f.body);
    await f.production.workshopLease(workshop, item.id, 'tab-one', 'acquire');
    await assert.rejects(f.production.actOnWorkshop(workshop, item.id, 1, 'Checked finished goods', 'post', 'tab-two'), { status: 409 });
    const posted = await f.production.actOnWorkshop(workshop, item.id, 1, 'Checked finished goods', 'post', 'tab-one');
    assert.equal(posted.status, 'POSTED'); assert.equal(f.balance(), '25.000'); assert.equal(f.state.movements.length, 1);
    await f.production.actOnWorkshop(workshop, item.id, 1, 'Checked finished goods', 'post', 'tab-one'); assert.equal(f.state.movements.length, 1);
});
test('workshop inventory can monitor production but cannot post or edit it', async () => {
    const f = await productionFixture(), item = await f.production.createWorkshop(workshop, f.body);
    assert.equal((await f.production.workshopDetail(inventory, item.id)).id, item.id);
    await assert.rejects(f.production.saveWorkshop(inventory, item.id, { ...f.body, version: 1 }), { status: 403 });
    await assert.rejects(f.production.workshopLease(inventory, item.id, 'inventory-tab', 'acquire'), { status: 403 });
});
