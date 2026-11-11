import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, salesInventory, inventory, manager, admin } from './return-harness.mjs';
const query = { view: 'balances', page: 1 };
test('combined delivery/return transit has correct directions and is counted once globally', async () => {
    const f = await fixture(); let delivery = await f.dispatched(f.input('6')); await f.switchUser(delivery, manager); delivery = await f.action(delivery, 'receive', [{ productId: 'pcs', quantity: '2' }], manager);
    let item = await f.dispatchedReturn(f.body('5')); await f.acquire(item, inventory); item = await f.act(item, 'receive', inventory, [{ productId: 'pcs', quantity: '1' }]);
    const report = await f.monitor.inventoryReport(admin, query), total = report.totals.find(row => row.productId === 'pcs');
    assert.equal(total.onHand, '32.000'); assert.equal(total.incoming, '8.000'); assert.equal(total.outgoing, '8.000'); assert.equal(total.uniqueTransit, '8.000');
    const own = await f.monitor.inventoryReport(manager, query); assert.equal(own.items.length, 1); assert.equal(own.items[0].branchCode, 'BR01'); assert.equal(own.items[0].onHand, '17.000'); assert.equal(own.items[0].incoming, '4.000'); assert.equal(own.items[0].outgoing, '4.000');
    const ws = await f.monitor.inventoryReport(inventory, query); assert.equal(ws.items[0].onHand, '15.000'); assert.equal(ws.items[0].incomingReturn, '4.000'); assert.equal(ws.items[0].outgoingDelivery, '4.000');
    const transit = await f.monitor.inventoryReport(admin, { view: 'transit', page: 1 }); assert.equal(transit.items.length, 2); assert.equal(transit.items.every(row => row.outstanding === '4.000'), true);
});
test('draft and submitted returns are not transit and do not reduce on hand', async () => {
    const f = await fixture(); await f.submitted(); const own = await f.monitor.inventoryReport(manager, query); assert.equal(own.items[0].onHand, '20.000'); assert.equal(own.items[0].outgoing, '0.000');
    assert.equal((await f.monitor.inventoryReport(admin, { view: 'transit', page: 1 })).totalItems, 0);
});
test('source branch cannot bypass scope with another branch or location-type filter', async () => {
    const f = await fixture(); await assert.rejects(f.monitor.inventoryReport(manager, { ...query, branchId: 'WS01' }), { status: 403 }); await assert.rejects(f.monitor.inventoryReport(manager, { ...query, locationType: 'BAKERY' }), { status: 403 });
    const options = await f.monitor.inventoryOptions(manager); assert.equal(options.canSeeAll, false); assert.equal(options.branches.length, 1); assert.equal(options.branches[0].id, 'BR01');
});
test('admin filters include only selected locations and product; zero rows are explicit', async () => {
    const f = await fixture(); await f.dispatchedReturn();
    const bakery = await f.monitor.inventoryReport(admin, { ...query, locationType: 'BAKERY' }); assert.equal(bakery.items.every(row => row.locationType === 'BAKERY'), true); assert.equal(bakery.totals[0].uniqueTransit, '8.000');
    const cream = await f.monitor.inventoryReport(admin, { ...query, productId: 'kg' }); assert.equal(cream.items.length, 0);
    const zeros = await f.monitor.inventoryReport(admin, { ...query, productId: 'kg', includeZero: true }); assert.equal(zeros.items.length, 4); assert.equal(zeros.items.every(row => row.onHand === '0.000'), true);
});
test('movement history is scoped and carries RTN references without editing capabilities', async () => {
    const f = await fixture(), item = await f.dispatchedReturn();
    const own = await f.monitor.inventoryReport(manager, { view: 'movements', page: 1 }); assert.equal(own.items.length, 1); assert.equal(own.items[0].kind, 'RETURN_DISPATCH'); assert.equal(own.items[0].stockReturn.id, item.id); assert.equal(own.items[0].quantityDelta, '-8.000');
    assert.equal((await f.monitor.inventoryReport(inventory, { view: 'movements', page: 1 })).items.length, 0);
});
test('request eligibility is visible only to its source inventory and reflects reservations', async () => {
    const f = await fixture(), req = f.receivedRequest(); await f.submitted({ ...f.body('6'), sourceRequestId: req.id });
    const options = await f.returns.returnOptions(salesInventory); assert.equal(options.requests[0].lines[0].quantity, '4.000'); assert.equal(options.requests[0].destinationBranchId, 'WS01');
    const monitor = await f.returns.returnOptions(manager); assert.equal(monitor.creating, false); assert.equal(monitor.requests.length, 0);
});
test('deactivated identity is denied even on admin monitoring API', async () => { const f = await fixture(); f.state.users.find(user => user.id === admin.id).isActive = false; await assert.rejects(f.monitor.inventoryReport(admin, query), { status: 403 }); });
test('decimal aggregation does not use floating point and duplicate representations cannot double transit', async () => {
    const f = await fixture(), branches = f.state.branches, product = f.state.products[1];
    const flow = { id: 'one', trackingNumber: 1, type: 'RETURN', productId: 'kg', quantity: '0.300', received: '0.100', restored: '0.000', sourceBranch: branches.find(row => row.id === 'BR01'), destinationBranch: branches.find(row => row.id === 'WS01'), businessDate: '2030-01-01' };
    const totals = f.totals.inventoryTotals([product], branches, [{ branchId: 'BR01', productId: 'kg', quantity: '0.100' }, { branchId: 'WS01', productId: 'kg', quantity: '0.200' }], [flow, flow]); assert.equal(totals.totals[0].onHand, '0.300'); assert.equal(totals.totals[0].uniqueTransit, '0.200'); assert.equal(totals.transit.length, 1);
});
