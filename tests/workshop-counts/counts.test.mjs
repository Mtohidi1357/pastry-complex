import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture as stockFixture, load, validation, inventory, inventory2, workshop, manager, admin } from './stock-harness.mjs';

const wm2 = { id: 'wm2', username: 'workshop02', roleCode: 'WM', branchId: 'WS02' };
function matches(row, where = {}) {
    if (!row) return false;
    return Object.entries(where).every(([key, value]) => value === undefined || (key === 'OR' ? value.some(item => matches(row, item)) : value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : value && typeof value === 'object' && 'not' in value ? row[key] !== value.not : value && typeof value === 'object' && 'is' in value ? matches(row[key], value.is) : row[key] === value));
}
async function fixture() {
    const f = await stockFixture(); let serial = 0, token = 0;
    Object.assign(f.state, { counts: [], countEvents: [], failCountAudit: false });
    f.state.users.push({ ...wm2, isActive: true, role: { code: 'WM' } });
    const clone = value => value === undefined ? null : structuredClone(value), row = where => f.state.counts.find(item => matches(item, where));
    const view = item => ({ ...clone(item), branch: clone(f.state.branches.find(branch => branch.id === item.branchId)), lines: item.lines.map(line => ({ ...clone(line), product: clone(f.state.products.find(product => product.id === line.productId)) })), events: clone(f.state.countEvents.filter(event => event.countId === item.id)) });
    const models = {
        stockCount: {
            findUnique: async ({ where, include }) => { const item = row(where); return item ? include ? view(item) : clone(item) : null; },
            findUniqueOrThrow: async ({ where }) => view(row(where)),
            create: async ({ data }) => { const item = { ...clone(data), id: 'count' + (++serial), trackingNumber: serial, version: 1, status: 'DRAFT', note: null, lines: data.lines.create.map(line => ({ ...clone(line), countedQuantity: null })) }; f.state.counts.push(item); return clone(item); },
            update: async ({ where, data }) => { const item = row(where); for (const [key, value] of Object.entries(data)) item[key] = key === 'version' ? item.version + value.increment : value; return clone(item); },
            findMany: async ({ where, skip, take }) => f.state.counts.map(view).filter(item => matches(item, where)).slice(skip, skip + take),
            count: async ({ where }) => f.state.counts.map(view).filter(item => matches(item, where)).length,
        },
        stockCountLine: {
            update: async ({ where, data }) => { const key = where.countId_productId, line = row({ id: key.countId }).lines.find(line => line.productId === key.productId); Object.assign(line, clone(data)); return clone(line); },
            findFirst: async ({ where }) => { for (const item of f.state.counts) for (const line of item.lines) if (matches({ ...line, count: item }, where)) return clone(line); return null; },
        },
        stockCountEvent: { create: async ({ data }) => { if (f.state.failCountAudit) throw Error('audit failed'); const event = { id: 'count-event' + (++serial), ...clone(data) }; f.state.countEvents.push(event); return clone(event); } },
    };
    Object.assign(f.tx, models); Object.assign(f.prisma, models);
    const query = f.tx.$queryRaw;
    f.tx.$queryRaw = async (strings, ...args) => strings.join('?').includes('stock_counts') ? row({ id: args[0] }) ? [{ id: args[0] }] : [] : query(strings, ...args);
    f.tx.stockMovement.findFirst = async ({ where }) => clone(f.state.movements.find(item => matches(item, where)));
    const countPolicy = await load('src/features/stock/countPolicy.ts');
    const counts = await load('src/features/stock/countService.ts', { '@/lib/prisma': { prisma: f.prisma }, './countPolicy': countPolicy, './stockValidation': validation });
    const tasks = await load('src/features/dashboard/countTaskService.ts', { '@/lib/prisma': { prisma: f.prisma }, '../stock/countPolicy': countPolicy });
    const stockPolicy = await load('src/features/stock/stockPolicy.ts', { '@/lib/constants/roles': { Roles: { INV: 'INV', BM: 'BM', WM: 'WM', ADMIN: 'ADMIN' } } });
    const productionPolicy = await load('src/features/workshop/workshopPolicy.ts');
    const production = await load('src/features/workshop/workshopPosting.ts', { '../stock/stockValidation': validation, './workshopPolicy': productionPolicy });
    const body = (kind = 'COUNT', productIds = ['pcs']) => ({ clientRequestId: 'count-token' + (++token), kind, businessDate: '2030-01-01', productIds });
    const save = (item, quantity = '18', user = inventory) => counts.saveCount(user, item.id, { version: item.version, note: 'Finished goods physically counted', lines: item.lines.map(line => ({ productId: line.productId, countedQuantity: quantity })) });
    async function ready(quantity = '18', user = inventory, input = body()) { let item = await counts.startCount(user, input); item = await save(item, quantity, user); return counts.submitCount(user, item.id, item.version); }
    return { ...f, counts, tasks, countPolicy, stockPolicy, production, body, save, ready };
}
test('workshop count adjusts only WS01 by approved difference and preserves stock history', async () => {
    const f = await fixture(); let count = await f.ready(); assert.equal(f.balance(), '20.000'); assert.equal(f.state.movements.length, 0);
    count = await f.counts.decideCount(workshop, count.id, count.version, 'Historical workshop balance reconciled to physical goods', true);
    assert.equal(count.status, 'APPROVED'); assert.equal(f.balance(), '18.000'); assert.equal(f.balance('BR01'), '0.000');
    assert.equal(f.state.movements[0].quantityDelta, '-2.000'); assert.equal(f.state.movements[0].kind, 'COUNT_ADJUSTMENT'); assert.equal(f.state.movements[0].countId, count.id);
    await f.counts.decideCount(workshop, count.id, 1, 'Retry the approved count', true); assert.equal(f.state.movements.length, 1);
});
test('zero difference approves without fake movement; physical zero can clear a recorded balance', async () => {
    const f = await fixture(); let count = await f.ready('20'); await f.counts.decideCount(workshop, count.id, count.version, 'No discrepancy found in physical count', true); assert.equal(f.state.movements.length, 0);
    count = await f.ready('0'); await f.counts.decideCount(workshop, count.id, count.version, 'No goods physically remain in workshop', true); assert.equal(f.balance(), '0.000'); assert.equal(f.state.movements[0].quantityDelta, '-20.000');
});
test('inventory cannot approve and manager cannot enter quantities or approve a different workshop', async () => {
    const f = await fixture(), count = await f.ready();
    await assert.rejects(f.counts.decideCount(inventory, count.id, count.version, 'Attempt to self approve', true), { status: 403 });
    await assert.rejects(f.counts.saveCount(workshop, count.id, { version: count.version, note: 'Override count', lines: [] }), { status: 403 });
    await assert.rejects(f.counts.decideCount(wm2, count.id, count.version, 'Wrong workshop manager', true), { status: 403 });
    await assert.rejects(f.counts.decideCount({ ...manager, branchId: 'WS01' }, count.id, count.version, 'BM cannot manage bakery', true), { status: 403 });
    await assert.rejects(f.counts.decideCount(admin, count.id, count.version, 'Admin monitors only', true), { status: 403 });
});
test('account/role changes cannot permit self approval', async () => {
    const f = await fixture(), count = await f.ready(); f.state.users.find(user => user.id === inventory.id).role.code = 'WM';
    await assert.rejects(f.counts.decideCount({ ...inventory, roleCode: 'WM' }, count.id, count.version, 'Attempt to approve own earlier count', true), { status: 403 });
});
test('dispatch service invalidates a submitted snapshot; return, refresh and recount recover it', async () => {
    const f = await fixture(); let count = await f.ready(); const delivery = await f.dispatched(f.input('5'));
    await assert.rejects(f.counts.decideCount(workshop, count.id, count.version, 'Stale inventory count', true), { status: 409 }); assert.equal(f.balance(), '15.000');
    count = await f.counts.decideCount(workshop, count.id, count.version, 'Return for recount after dispatch', false); assert.equal(count.status, 'DRAFT');
    count = await f.counts.refreshCount(inventory, count.id, count.version); assert.equal(count.lines[0].countedQuantity, null); assert.equal(count.lines[0].expectedQuantity, '15.000');
    await assert.rejects(f.counts.submitCount(inventory, count.id, count.version), { status: 400 });
    count = await f.save(count, '14'); count = await f.counts.submitCount(inventory, count.id, count.version); await f.counts.decideCount(workshop, count.id, count.version, 'Recount after goods left workshop', true);
    assert.equal(f.balance(), '14.000'); assert.equal(f.state.deliveries[0].id, delivery.id); assert.equal(f.state.deliveries[0].lines[0].receivedQuantity, '0.000');
});
test('dispatch plus physical return with zero net change still invalidates the revision', async () => {
    const f = await fixture(), count = await f.ready('20'); let delivery = await f.dispatched(f.input('3')); delivery = await f.action(delivery, 'return', [{ productId: 'pcs', quantity: '3' }]);
    assert.equal(f.balance(), '20.000'); assert.equal(delivery.status, 'RETURNED');
    await assert.rejects(f.counts.decideCount(workshop, count.id, count.version, 'Same quantity is not the same revision', true), { status: 409 });
});
test('workshop production service invalidates count approval', async () => {
    const f = await fixture(), count = await f.ready();
    await f.prisma.$transaction(tx => f.production.postWorkshopStock(tx, { id: 'new-production', branchId: 'WS01', sourceType: 'MANUAL_PRODUCTION', businessDate: new Date('2030-01-01'), lines: [{ productId: 'pcs', quantity: '2' }] }, workshop, new Date()));
    assert.equal(f.balance(), '22.000'); await assert.rejects(f.counts.decideCount(workshop, count.id, count.version, 'Production occurred after snapshot', true), { status: 409 });
});
test('a draft cannot save against quantities that moved after capture', async () => {
    const f = await fixture(); let count = await f.counts.startCount(inventory, f.body()); await f.dispatched(f.input('2'));
    await assert.rejects(f.save(count, '18'), { status: 409 }); assert.equal(f.state.counts[0].lines[0].countedQuantity, null);
    count = await f.counts.refreshCount(inventory, count.id, count.version); count = await f.save(count, '18'); assert.equal(count.lines[0].countedQuantity, '18.000');
});
test('approval of one adjustment makes an overlapping snapshot stale', async () => {
    const f = await fixture(), first = await f.ready('18'), second = await f.ready('17');
    await f.counts.decideCount(workshop, first.id, first.version, 'First physical count checked', true);
    await assert.rejects(f.counts.decideCount(workshop, second.id, second.version, 'Overlapping older snapshot', true), { status: 409 });
    assert.equal(f.balance(), '18.000'); assert.equal(f.state.movements.length, 1);
});
test('unrelated product movement does not invalidate a count for selected products', async () => {
    const f = await fixture(), count = await f.ready();
    await f.prisma.$transaction(tx => f.production.postWorkshopStock(tx, { id: 'cream-production', branchId: 'WS01', sourceType: 'MANUAL_PRODUCTION', businessDate: new Date('2030-01-01'), lines: [{ productId: 'kg', quantity: '2' }] }, workshop, new Date()));
    await f.counts.decideCount(workshop, count.id, count.version, 'Selected product count is still fresh', true); assert.equal(f.balance(), '18.000'); assert.equal(f.balance('WS01', 'kg'), '2.000');
});
test('failure creating audit or movement rolls back adjustments, status and approval', async () => {
    for (const flag of ['failCountAudit', 'failMovement']) { const f = await fixture(), count = await f.ready(); f.state[flag] = true;
        await assert.rejects(f.counts.decideCount(workshop, count.id, count.version, 'Atomic adjustment approval', true)); assert.equal(f.balance(), '20.000'); assert.equal(f.state.counts[0].status, 'SUBMITTED'); assert.equal(f.state.movements.length, 0);
    }
});
test('multiple-product failure rolls back earlier adjustments', async () => {
    const f = await fixture(); f.state.balances.push({ branchId: 'WS01', productId: 'kg', quantity: '4.000', revision: 1 }); const count = await f.ready('2', inventory, f.body('COUNT', ['pcs', 'kg']));
    f.state.failMovementAfter = 1; await assert.rejects(f.counts.decideCount(workshop, count.id, count.version, 'All rows must commit together', true)); assert.equal(f.balance(), '20.000'); assert.equal(f.balance('WS01', 'kg'), '4.000'); assert.equal(f.state.movements.length, 0);
});
test('WS02 counts change only WS02 and managers see only their own submitted cases', async () => {
    const f = await fixture(); const first = await f.ready(); let second = await f.ready('3', inventory2);
    assert.equal((await f.tasks.managerCountTasks(workshop, 1)).items[0].id, first.id); assert.equal((await f.tasks.managerCountTasks(wm2, 1)).items[0].id, second.id);
    second = await f.counts.decideCount(wm2, second.id, second.version, 'WS02 physical count reviewed', true); assert.equal(f.balance('WS02'), '3.000'); assert.equal(f.balance(), '20.000');
    assert.equal((await f.tasks.managerCountTasks(wm2, 1)).totalItems, 0); assert.equal((await f.tasks.managerCountTasks(wm2, 1, true)).totalItems, 1);
    await assert.rejects(f.counts.countDetail(workshop, second.id), { status: 403 }); assert.equal((await f.counts.listCounts(admin, 1, undefined, true)).totalItems, 2);
});
test('workshop opening via count endpoint is rejected; sales opening/count workflow still works', async () => {
    const f = await fixture(); await assert.rejects(f.counts.startCount(inventory, f.body('OPENING')), { status: 409 });
    const salesInventory = { id: 'sales-inv', username: 'sales-inv', roleCode: 'INV', branchId: 'BR01' }; f.state.users.push({ ...salesInventory, role: { code: 'INV' }, isActive: true });
    let count = await f.ready('4', salesInventory, f.body('OPENING')); count = await f.counts.decideCount(manager, count.id, count.version, 'Sales opening stock verified', true);
    assert.equal(f.balance('BR01'), '4.000'); assert.equal(f.state.movements[0].kind, 'OPENING_BALANCE'); assert.equal(f.balance(), '20.000');
});
test('fractional pieces and negative quantities fail, decimals remain exact', async () => {
    const f = await fixture(); let count = await f.counts.startCount(inventory, f.body());
    for (const value of ['1.5', '-1']) await assert.rejects(f.save(count, value)); assert.equal(f.state.counts[0].lines[0].countedQuantity, null);
    count = await f.ready('0.125', inventory, f.body('COUNT', ['kg'])); await f.counts.decideCount(workshop, count.id, count.version, 'Exact physical cream weight', true); assert.equal(f.balance('WS01', 'kg'), '0.125');
});
test('same start token retries once and stale or concurrently approved counts never post twice', async () => {
    const f = await fixture(), input = f.body(); const [a, b] = await Promise.all([f.counts.startCount(inventory, input), f.counts.startCount(inventory, input)]); assert.equal(a.id, b.id);
    const saved = await f.save(a); await assert.rejects(f.save(a, '19'), { status: 409 }); const submitted = await f.counts.submitCount(inventory, saved.id, saved.version);
    await Promise.all([f.counts.decideCount(workshop, submitted.id, submitted.version, 'Checked once by manager', true), f.counts.decideCount(workshop, submitted.id, submitted.version, 'Matching approval retry', true)]); assert.equal(f.state.movements.length, 1);
});
test('active account/branch membership is checked on count reads and approval', async () => {
    const f = await fixture(), count = await f.ready(); f.state.users.find(user => user.id === workshop.id).isActive = false;
    await assert.rejects(f.counts.countDetail(workshop, count.id), { status: 403 }); await assert.rejects(f.counts.listCounts(workshop, 1), { status: 403 }); await assert.rejects(f.counts.countOptions(workshop), { status: 403 }); await assert.rejects(f.tasks.managerCountTasks(workshop, 1), { status: 403 });
    f.state.users.find(user => user.id === workshop.id).isActive = true; f.state.branches.find(branch => branch.id === 'WS01').isActive = false; await assert.rejects(f.counts.decideCount(workshop, count.id, count.version, 'Inactive workshop cannot approve', true), { status: 403 });
});
test('count permission does not grant WM general receipt access', async () => { const f = await fixture(); assert.equal(f.stockPolicy.canViewStock('WM'), false); assert.throws(() => f.stockPolicy.assertStockWrite(workshop, 'receive'), { status: 403 }); });
test('options expose workshop capabilities without enabling the sales opening path', async () => {
    const f = await fixture(), input = await f.counts.countOptions(inventory), review = await f.counts.countOptions(workshop), monitor = await f.counts.countOptions(admin);
    assert.equal(input.locationType, 'BAKERY'); assert.equal(input.canStart, true); assert.equal(input.allowOpening, false);
    assert.equal(review.canStart, false); assert.equal(monitor.canStart, false); assert.equal(monitor.branches.length, 4);
});
