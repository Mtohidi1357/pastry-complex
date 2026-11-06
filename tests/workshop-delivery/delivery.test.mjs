import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, inventory, inventory2, manager, manager2, workshop, admin, quantity } from './harness.mjs';

test('dispatch debits source once, receiving credits only actual goods, return conserves stock', async () => {
    const f = await fixture(); let item = await f.dispatched();
    assert.equal(f.balance(), '10.000'); assert.equal(f.balance('BR01'), '0.000');
    await f.switchUser(item, manager); item = await f.action(item, 'receive', [{ productId: 'pcs', quantity: '9' }], manager);
    assert.equal(f.balance('BR01'), '9.000'); assert.equal(item.status, 'DISPATCHED'); assert.equal(quantity.outstanding(item.lines[0]), 1000n);
    await f.service.deliveryLease(manager, item.id, 'editor', 'release'); await f.acquire(item); item = await f.action(item, 'return', [{ productId: 'pcs', quantity: '1' }]);
    assert.equal(item.status, 'RESOLVED'); assert.equal(f.balance(), '11.000'); assert.equal(f.balance('BR01'), '9.000');
    assert.equal(f.state.movements.length, 3); assert.equal(f.state.events.length, 4);
});
test('a draft changes no stock and a cancelled request draft frees its request without losing audit', async () => {
    const f = await fixture(); const request = f.request(); let item = await f.service.createDelivery(inventory, { ...f.input(), sourceRequestId: request.id });
    assert.equal(f.balance(), '20.000'); assert.equal(f.state.movements.length, 0); await f.acquire(item); item = await f.action(item, 'cancel');
    assert.equal(item.sourceRequestId, null); assert.match(item.events.at(-1).note, /REQ-000001/); assert.equal(item.events.at(-1).payload.sourceRequestId, request.id);
    const replacement = await f.service.createDelivery(inventory, { ...f.input(), sourceRequestId: request.id }); assert.notEqual(replacement.id, item.id);
});
test('concurrent duplicate create tokens and matching action retries never post twice', async () => {
    const f = await fixture(), body = f.input(); const [a, b] = await Promise.all([f.service.createDelivery(inventory, body), f.service.createDelivery(inventory, body)]); assert.equal(a.id, b.id);
    await f.acquire(a); const input = { clientRequestId: 'one-dispatch' }; await Promise.all([f.action(a, 'dispatch', undefined, inventory, input), f.action(a, 'dispatch', undefined, inventory, input)]);
    assert.equal(f.state.movements.length, 1); assert.equal(f.balance(), '10.000');
    await assert.rejects(f.action(a, 'dispatch', undefined, inventory, { ...input, reason: 'Changed retry payload' }), { status: 409 });
});
test('partial receipt retries are idempotent, distinct stale submissions are rejected', async () => {
    const f = await fixture(), item = await f.dispatched(); await f.switchUser(item, manager);
    const rows = [{ productId: 'pcs', quantity: '4' }], overrides = { clientRequestId: 'receipt-once' };
    await Promise.all([f.action(item, 'receive', rows, manager, overrides), f.action(item, 'receive', rows, manager, overrides)]);
    assert.equal(f.balance('BR01'), '4.000'); await assert.rejects(f.action(item, 'receive', rows, manager), { status: 409 }); assert.equal(f.balance('BR01'), '4.000');
});
test('insufficient stock and inactive products prevent dispatch with no partial debit', async () => {
    const f = await fixture(), item = await f.service.createDelivery(inventory, f.input('21')); await f.acquire(item);
    await assert.rejects(f.action(item, 'dispatch'), { status: 409 }); assert.equal(f.balance(), '20.000'); assert.equal(f.state.movements.length, 0);
    f.state.products[0].isActive = false; await assert.rejects(f.action(item, 'dispatch'), { status: 409 }); assert.equal(f.state.deliveries[0].status, 'DRAFT');
});
test('wrong workshop, wrong destination, admin and WM cannot mutate deliveries', async () => {
    const f = await fixture(), item = await f.dispatched();
    for (const [user, action] of [[inventory2, 'return'], [manager2, 'receive'], [admin, 'receive'], [workshop, 'dispatch']]) await assert.rejects(f.action(item, action, [{ productId: 'pcs', quantity: '1' }], user), { status: 403 });
    await assert.rejects(f.service.deliveryDetail(inventory2, item.id), { status: 403 });
    assert.equal((await f.service.deliveryList(inventory2, 1, true)).totalItems, 0); assert.equal((await f.service.deliveryList(admin, 1, true)).totalItems, 1);
});
test('over-receiving, over-returning, unrelated products and fractional pieces are rejected', async () => {
    const f = await fixture(), item = await f.dispatched(); await f.switchUser(item, manager);
    for (const row of [{ productId: 'pcs', quantity: '11' }, { productId: 'kg', quantity: '1' }, { productId: 'pcs', quantity: '1.5' }]) await assert.rejects(f.action(item, 'receive', [row], manager));
    assert.equal(f.balance('BR01'), '0.000'); await f.service.deliveryLease(manager, item.id, 'editor', 'release'); await f.acquire(item); await assert.rejects(f.action(item, 'return', [{ productId: 'pcs', quantity: '11' }]));
});
test('decimal receipt and return arithmetic remains exact', async () => {
    const f = await fixture(); f.state.balances.push({ branchId: 'WS01', productId: 'kg', quantity: '1.000', revision: 1 });
    let item = await f.dispatched({ ...f.input(), lines: [{ productId: 'kg', quantity: '0.300' }] }); assert.equal(f.balance('WS01', 'kg'), '0.700');
    await f.switchUser(item, manager); item = await f.action(item, 'receive', [{ productId: 'kg', quantity: '0.100' }], manager); item = await f.action(item, 'receive', [{ productId: 'kg', quantity: '0.200' }], manager);
    assert.equal(f.balance('BR01', 'kg'), '0.300'); assert.equal(item.status, 'RECEIVED');
});
test('movement and audit failures roll back stock, status, event and received totals', async () => {
    for (const failure of ['failMovement', 'failAudit']) {
        const f = await fixture(); const item = await f.service.createDelivery(inventory, f.input()); await f.acquire(item); f.state[failure] = true;
        await assert.rejects(f.action(item, 'dispatch')); assert.equal(f.balance(), '20.000'); assert.equal(f.state.deliveries[0].status, 'DRAFT'); assert.equal(f.state.movements.length, 0); assert.equal(f.state.events.length, 1);
    }
    const f = await fixture(), item = await f.dispatched(); await f.switchUser(item, manager); f.state.failAudit = true;
    await assert.rejects(f.action(item, 'receive', [{ productId: 'pcs', quantity: '3' }], manager)); assert.equal(f.balance('BR01'), '0.000'); assert.equal(f.state.deliveries[0].lines[0].receivedQuantity, '0.000');
});
test('later-product failure rolls back earlier source debit', async () => {
    const f = await fixture(); f.state.balances.push({ branchId: 'WS01', productId: 'kg', quantity: '2.000', revision: 1 });
    const item = await f.service.createDelivery(inventory, { ...f.input(), lines: [{ productId: 'pcs', quantity: '3' }, { productId: 'kg', quantity: '1' }] }); await f.acquire(item); f.state.failMovementAfter = 1;
    await assert.rejects(f.action(item, 'dispatch')); assert.equal(f.balance(), '20.000'); assert.equal(f.balance('WS01', 'kg'), '2.000'); assert.equal(f.state.movements.length, 0);
});
test('request receiving requires dispatched goods and credits branch once through original receipt', async () => {
    const f = await fixture(), request = f.request();
    await assert.rejects(f.prisma.$transaction(tx => f.requestReceiving.postRequestReceiving(tx, request, manager, new Date())), { status: 409 }); assert.equal(f.state.receipts.length, 0);
    let item = await f.dispatched({ ...f.input(), sourceRequestId: request.id });
    await f.switchUser(item, manager); await assert.rejects(f.action(item, 'receive', [{ productId: 'pcs', quantity: '9' }], manager), { status: 409 });
    const receiptId = await f.prisma.$transaction(async tx => { const id = await f.requestReceiving.postRequestReceiving(tx, request, manager, new Date()); await tx.dailyRequest.update({ where: { id: request.id }, data: { status: 'CLOSED' } }); return id; });
    assert.equal(f.balance(), '10.000'); assert.equal(f.balance('BR01'), '9.000'); assert.equal(f.state.receipts.length, 1);
    assert.equal(f.state.movements.find(row => row.receiptId === receiptId).deliveryId, item.id);
    item = await f.service.deliveryDetail(manager, item.id); assert.equal(quantity.outstanding(item.lines[0]), 1000n);
    await assert.rejects(f.prisma.$transaction(tx => f.requestReceiving.postRequestReceiving(tx, request, manager, new Date())), { status: 409 });
    item = await f.action(item, 'receive', [{ productId: 'pcs', quantity: '1' }], manager); assert.equal(item.status, 'RECEIVED'); assert.equal(f.balance('BR01'), '10.000'); assert.equal(f.state.receipts.length, 1);
});
test('request receiving beyond dispatch fails atomically; failure closing request rolls receiving back', async () => {
    const f = await fixture(), request = f.request(); await f.dispatched({ ...f.input('8'), sourceRequestId: request.id });
    await assert.rejects(f.prisma.$transaction(tx => f.requestReceiving.postRequestReceiving(tx, request, manager, new Date())), { status: 409 }); assert.equal(f.balance('BR01'), '0.000'); assert.equal(f.state.receipts.length, 0);
    request.lines[0].receivedQty = 7; f.state.requests[0].lines[0].receivedQty = 7; f.state.failClose = true;
    await assert.rejects(f.prisma.$transaction(async tx => { await f.requestReceiving.postRequestReceiving(tx, request, manager, new Date()); await tx.dailyRequest.update({ where: { id: request.id }, data: { status: 'CLOSED' } }); }));
    assert.equal(f.balance('BR01'), '0.000'); assert.equal(f.state.receipts.length, 0); assert.equal(f.state.deliveries[0].lines[0].receivedQuantity, '0.000');
});
test('legacy receiving without workshop production retains its existing behaviour', async () => {
    const f = await fixture(), request = f.request(); f.state.productions = [];
    await f.prisma.$transaction(tx => f.requestReceiving.postRequestReceiving(tx, request, manager, new Date())); assert.equal(f.balance(), '20.000'); assert.equal(f.balance('BR01'), '9.000'); assert.equal(f.state.deliveries.length, 0);
});
test('request link rejects another workshop, changed destination, duplicate request or excess produced quantity', async () => {
    const f = await fixture(), request = f.request();
    await assert.rejects(f.service.createDelivery(inventory, { ...f.input('11'), sourceRequestId: request.id }), { status: 409 });
    await assert.rejects(f.service.createDelivery(inventory2, { ...f.input(), sourceRequestId: request.id }), { status: 409 });
    await assert.rejects(f.service.createDelivery(inventory, { ...f.input(), sourceRequestId: request.id, destinationBranchId: 'BR02' }), { status: 409 });
    await f.service.createDelivery(inventory, { ...f.input(), sourceRequestId: request.id }); await assert.rejects(f.service.createDelivery(inventory, { ...f.input(), sourceRequestId: request.id }), { status: 409 });
});
test('opposite directions use a deterministic branch lock order before document locks', async () => {
    const f = await fixture(); await f.dispatched();
    const ids = f.locks.filter(row => row.sql.includes('branches')).map(row => row.args[0]); assert.deepEqual(ids, ['BR01', 'WS01', 'BR01', 'WS01', 'BR01', 'WS01']);
});
test('finished filter keeps outstanding deliveries visible and hides resolved ones', async () => {
    const f = await fixture(); let item = await f.dispatched(); assert.equal((await f.service.deliveryList(manager, 1, false)).totalItems, 1);
    await f.switchUser(item, manager); item = await f.action(item, 'receive', [{ productId: 'pcs', quantity: '10' }], manager); assert.equal(item.status, 'RECEIVED');
    assert.equal((await f.service.deliveryList(manager, 1, false)).totalItems, 0); assert.equal((await f.service.deliveryList(manager, 1, true)).totalItems, 1);
});
test('deactivated accounts and branches fail authorization before any lease mutation', async () => {
    const f = await fixture(), item = await f.dispatched(); f.state.users.find(row => row.id === inventory.id).isActive = false;
    await assert.rejects(f.action(item, 'return', [{ productId: 'pcs', quantity: '1' }]), { status: 403 }); assert.equal(f.balance(), '10.000');
});
test('two workshops dispatch independently to the same branch without mixing source balances', async () => {
    const f = await fixture(); f.state.balances.push({ branchId: 'WS02', productId: 'pcs', quantity: '7.000', revision: 1 });
    const first = await f.dispatched(f.input('3'));
    let second = await f.service.createDelivery(inventory2, f.input('2')); await f.acquire(second, inventory2); second = await f.action(second, 'dispatch', undefined, inventory2);
    assert.equal(f.balance(), '17.000'); assert.equal(f.balance('WS02'), '5.000');
    await f.switchUser(first, manager); await f.action(first, 'receive', [{ productId: 'pcs', quantity: '3' }], manager);
    await f.service.deliveryLease(inventory2, second.id, 'editor', 'release'); await f.acquire(second, manager); await f.action(second, 'receive', [{ productId: 'pcs', quantity: '2' }], manager);
    assert.equal(f.balance('BR01'), '5.000'); assert.equal(f.state.movements.filter(row => row.kind === 'DISPATCH').length, 2);
});
