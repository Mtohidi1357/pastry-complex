import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, load, validation, salesInventory, otherInventory, inventory, manager, workshop, admin } from './return-harness.mjs';
test('independent return moves branch to transit to workshop and restores only outstanding goods', async () => {
    const f = await fixture(); let item = await f.dispatchedReturn(); assert.equal(f.balance('BR01'), '12.000'); assert.equal(f.balance(), '20.000');
    await f.acquire(item, inventory); item = await f.act(item, 'receive', inventory, [{ productId: 'pcs', quantity: '5' }]); assert.equal(f.balance(), '25.000'); assert.equal(item.status, 'DISPATCHED'); await f.release(item, inventory);
    await f.acquire(item); item = await f.act(item, 'restore', salesInventory, [{ productId: 'pcs', quantity: '1' }]); await f.release(item, salesInventory); assert.equal(f.balance('BR01'), '13.000');
    await f.acquire(item, inventory); item = await f.act(item, 'receive', inventory, [{ productId: 'pcs', quantity: '2' }]); assert.equal(f.balance(), '27.000'); assert.equal(item.status, 'RESOLVED'); assert.equal(f.state.movements.length, 4);
});
test('draft/save/submit/manager correction do not move stock', async () => {
    const f = await fixture(); let item = await f.returns.createReturn(salesInventory, f.body()); await f.acquire(item);
    item = await f.returns.saveReturn(salesInventory, item.id, { ...f.body('6'), version: 1 }, 'editor'); item = await f.act(item, 'submit'); await f.release(item, salesInventory); assert.equal(f.balance('BR01'), '20.000');
    await f.acquire(item, manager); item = await f.act(item, 'review', manager); assert.equal(item.status, 'DRAFT'); assert.equal(f.state.movements.length, 0);
});
test('request-linked limit accounts for reservations and releases them on correction', async () => {
    const f = await fixture(), req = f.receivedRequest(); const first = await f.submitted({ ...f.body('6'), sourceRequestId: req.id }); const second = await f.returns.createReturn(salesInventory, { ...f.body('4'), sourceRequestId: req.id });
    await f.acquire(second); await assert.rejects(f.returns.saveReturn(salesInventory, second.id, { ...f.body('5'), version: 1 }, 'editor'), { status: 409 }); await f.release(second, salesInventory);
    await f.acquire(first, manager); const corrected = await f.act(first, 'review', manager); await f.release(corrected, manager);
    await f.acquire(second); const saved = await f.returns.saveReturn(salesInventory, second.id, { ...f.body('5'), version: 1 }, 'editor'); await f.act(saved, 'submit'); assert.equal(f.balance('BR01'), '20.000');
});
test('request-linked returns enforce actual cumulative receiving and original workshop', async () => {
    const f = await fixture(), req = f.receivedRequest('10', true); f.state.deliveries[0].lines[0].receivedQuantity = '8.000';
    await assert.rejects(f.returns.createReturn(salesInventory, { ...f.body('9'), sourceRequestId: req.id }), { status: 409 });
    await assert.rejects(f.returns.createReturn(salesInventory, { ...f.body('2'), sourceRequestId: req.id, destinationBranchId: 'WS02' }), { status: 409 });
    f.state.receipts[0].status = 'REVERSED'; await assert.rejects(f.returns.createReturn(salesInventory, { ...f.body('1'), sourceRequestId: req.id }), { status: 409 });
});
test('completed returns consume request eligibility; physically restored goods release that portion', async () => {
    const f = await fixture(), req = f.receivedRequest(); let item = await f.dispatchedReturn({ ...f.body('10'), sourceRequestId: req.id });
    await f.acquire(item, inventory); item = await f.act(item, 'receive', inventory, [{ productId: 'pcs', quantity: '6' }]); await f.release(item, inventory);
    await f.acquire(item); item = await f.act(item, 'restore', salesInventory, [{ productId: 'pcs', quantity: '4' }]);
    await f.returns.createReturn(salesInventory, { ...f.body('4'), sourceRequestId: req.id }); await assert.rejects(f.returns.createReturn(salesInventory, { ...f.body('5'), sourceRequestId: req.id }), { status: 409 });
});
test('manager cannot approve their own earlier inventory return after a role change', async () => {
    const f = await fixture(), item = await f.submitted(); f.state.users.find(user => user.id === salesInventory.id).role.code = 'BM';
    await assert.rejects(f.returns.actOnReturn({ ...salesInventory, roleCode: 'BM' }, item.id, 'dispatch', { version: item.version, clientRequestId: 'self', condition: 'SALEABLE', reason: 'Attempted self approval' }), { status: 403 });
});
test('wrong role and wrong location are denied before lease errors', async () => {
    const f = await fixture(), item = await f.dispatchedReturn();
    for (const [user, action] of [[admin, 'receive'], [workshop, 'receive'], [manager, 'receive'], [otherInventory, 'restore'], [salesInventory, 'dispatch']]) await assert.rejects(f.act(item, action, user, [{ productId: 'pcs', quantity: '1' }]), { status: 403 });
    await assert.rejects(f.returns.returnDetail(otherInventory, item.id), { status: 403 }); assert.equal((await f.returns.returnList(admin, 1, true)).totalItems, 1);
});
test('a second editor is blocked at acquisition and cannot release the first token', async () => {
    const f = await fixture(), item = await f.returns.createReturn(salesInventory, f.body()); await f.acquire(item);
    await assert.rejects(f.acquire(item, salesInventory, 'second'), error => error.code === 'EDIT_LEASE_CONFLICT'); await f.release(item, salesInventory, 'second'); await assert.rejects(f.acquire(item, salesInventory, 'second'), { status: 409 });
    await f.release(item, salesInventory); await f.acquire(item, salesInventory, 'second');
});
test('matching create and dispatch retries never duplicate stock', async () => {
    const f = await fixture(), body = f.body(); const [a, b] = await Promise.all([f.returns.createReturn(salesInventory, body), f.returns.createReturn(salesInventory, body)]); assert.equal(a.id, b.id);
    await f.acquire(a); let item = await f.act(a, 'submit'); await f.release(item, salesInventory); await f.acquire(item, manager);
    const overrides = { clientRequestId: 'dispatch-once' }; await Promise.all([f.act(item, 'dispatch', manager, undefined, overrides), f.act(item, 'dispatch', manager, undefined, overrides)]); assert.equal(f.balance('BR01'), '12.000'); assert.equal(f.state.movements.length, 1);
});
test('over-receipt, unrelated products and fractional PCS are rejected without a credit', async () => {
    const f = await fixture(), item = await f.dispatchedReturn(); await f.acquire(item, inventory);
    for (const line of [{ productId: 'pcs', quantity: '9' }, { productId: 'kg', quantity: '1' }, { productId: 'pcs', quantity: '0.5' }]) await assert.rejects(f.act(item, 'receive', inventory, [line])); assert.equal(f.balance(), '20.000');
});
test('damaged/expired classification cannot enter saleable return stock', async () => {
    const f = await fixture(); await assert.rejects(f.returns.createReturn(salesInventory, { ...f.body(), condition: 'EXPIRED' }), { status: 400 }); const item = await f.dispatchedReturn(); await f.acquire(item, inventory);
    await assert.rejects(f.act(item, 'receive', inventory, [{ productId: 'pcs', quantity: '1' }], { condition: 'DAMAGED' }), { status: 400 }); assert.equal(f.balance(), '20.000');
});
test('stock shortage and audit/movement failures roll back all approval changes', async () => {
    for (const flag of ['failReturnAudit', 'failMovement']) { const f = await fixture(), item = await f.submitted(); await f.acquire(item, manager); f.state[flag] = true; await assert.rejects(f.act(item, 'dispatch', manager)); assert.equal(f.balance('BR01'), '20.000'); assert.equal(f.state.returns[0].status, 'SUBMITTED'); assert.equal(f.state.movements.length, 0); }
    const f = await fixture(), item = await f.submitted(f.body('21')); await f.acquire(item, manager); await assert.rejects(f.act(item, 'dispatch', manager), { status: 409 }); assert.equal(f.balance('BR01'), '20.000');
});
test('receipt audit failure rolls back receiving counters and workshop stock together', async () => {
    const f = await fixture(), item = await f.dispatchedReturn(); await f.acquire(item, inventory); f.state.failReturnAudit = true; await assert.rejects(f.act(item, 'receive', inventory, [{ productId: 'pcs', quantity: '2' }])); assert.equal(f.balance(), '20.000'); assert.equal(f.state.returns[0].lines[0].receivedQuantity, '0.000');
});
test('deactivated account cannot read, renew or mutate a return', async () => {
    const f = await fixture(), item = await f.dispatchedReturn(); f.state.users.find(user => user.id === inventory.id).isActive = false; await assert.rejects(f.returns.returnDetail(inventory, item.id), { status: 403 }); await assert.rejects(f.acquire(item, inventory), { status: 403 });
});
test('expired lease is refused using database time without changing stock', async () => {
    const f = await fixture(), item = await f.submitted(); await f.acquire(item, manager); f.state.now = new Date(f.state.now.getTime() + 90_001);
    await assert.rejects(f.act(item, 'dispatch', manager), error => error.code === 'EDIT_LEASE_CONFLICT'); assert.equal(f.balance('BR01'), '20.000');
});
test('simultaneous distinct return submissions cannot over-reserve one request', async () => {
    const f = await fixture(), req = f.receivedRequest(); const a = await f.returns.createReturn(salesInventory, { ...f.body('6'), sourceRequestId: req.id }), b = await f.returns.createReturn(salesInventory, { ...f.body('6'), sourceRequestId: req.id }); await f.acquire(a); await f.acquire(b);
    const results = await Promise.allSettled([f.act(a, 'submit'), f.act(b, 'submit')]); assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); assert.equal(f.state.returns.filter(row => row.status === 'SUBMITTED').length, 1); assert.equal(f.state.movements.length, 0);
});
test('a later product failure rolls back earlier return deductions', async () => {
    const f = await fixture(); f.state.balances.push({ branchId: 'BR01', productId: 'kg', quantity: '4.000', revision: 1 }); const item = await f.submitted({ ...f.body(), lines: [{ productId: 'pcs', quantity: '2' }, { productId: 'kg', quantity: '1' }] }); await f.acquire(item, manager); f.state.failMovementAfter = 1;
    await assert.rejects(f.act(item, 'dispatch', manager)); assert.equal(f.balance('BR01'), '20.000'); assert.equal(f.balance('BR01', 'kg'), '4.000'); assert.equal(f.state.movements.length, 0);
});
test('submitted returns prevent reversing the legacy receiving record they depend on', async () => {
    const f = await fixture(), req = f.receivedRequest(); await f.submitted({ ...f.body('2'), sourceRequestId: req.id });
    const previousQuery = f.tx.$queryRaw; f.tx.$queryRaw = async (strings, ...args) => strings.join('?').includes('stock_receipts') ? [{ id: args[0] }] : previousQuery(strings, ...args);
    const policy = await load('src/features/stock/stockPolicy.ts', { '@/lib/constants/roles': { Roles: { INV: 'INV', BM: 'BM', WM: 'WM', ADMIN: 'ADMIN' } } });
    const posting = await load('src/features/stock/stockPosting.ts', { './stockValidation': validation });
    const stock = await load('src/features/stock/stockService.ts', { '@/lib/prisma': { prisma: f.prisma }, './stockPolicy': policy, './stockValidation': validation, './stockPosting': posting });
    await assert.rejects(stock.reverseReceipt(manager, 'original-receipt', 1, 'Attempt reversal after pending return'), error => error.status === 409 && /depends on this receiving/.test(error.message));
});
test('return dispatch advances revisions and invalidates an older branch count', async () => {
    const f = await fixture(); await f.dispatchedReturn();
    const doc = { id: 'old-count', version: 1, status: 'DRAFT', branchId: 'BR01', createdById: salesInventory.id, kind: 'COUNT', lines: [{ productId: 'pcs', expectedQuantity: '20.000', snapshotRevision: 1, countedQuantity: null, product: { unit: 'PCS' } }] };
    f.tx.stockCount = { findUnique: async () => doc }; f.prisma.stockCount = f.tx.stockCount;
    const previousQuery = f.tx.$queryRaw; f.tx.$queryRaw = async (strings, ...args) => strings.join('?').includes('stock_counts') ? [{ id: args[0] }] : previousQuery(strings, ...args);
    const policy = await load('src/features/stock/countPolicy.ts'); const counts = await load('src/features/stock/countService.ts', { '@/lib/prisma': { prisma: f.prisma }, './countPolicy': policy, './stockValidation': validation });
    await assert.rejects(counts.saveCount(salesInventory, doc.id, { version: 1, note: 'Older physical snapshot', lines: [{ productId: 'pcs', countedQuantity: '18' }] }), { status: 409 });
});
test('fractional-unit return dispatch and repeated partial receipts remain exact', async () => {
    const f = await fixture(); f.state.balances.push({ branchId: 'BR01', productId: 'kg', quantity: '1.000', revision: 1 }); let item = await f.dispatchedReturn({ ...f.body(), lines: [{ productId: 'kg', quantity: '0.300' }] }); assert.equal(f.balance('BR01', 'kg'), '0.700'); await f.acquire(item, inventory);
    item = await f.act(item, 'receive', inventory, [{ productId: 'kg', quantity: '0.100' }]); item = await f.act(item, 'receive', inventory, [{ productId: 'kg', quantity: '0.200' }]); assert.equal(f.balance('WS01', 'kg'), '0.300'); assert.equal(item.status, 'RECEIVED');
});
