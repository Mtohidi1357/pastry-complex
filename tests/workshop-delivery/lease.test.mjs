import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, inventory, inventory2, manager } from './harness.mjs';

test('second editor of the same user is blocked at acquisition, not only at save', async () => {
    const f = await fixture(), item = await f.service.createDelivery(inventory, f.input()); await f.acquire(item, inventory, 'tab-one');
    await assert.rejects(f.acquire(item, inventory, 'tab-two'), error => error.code === 'EDIT_LEASE_CONFLICT' && /another tab or device/.test(error.message));
    await assert.rejects(f.service.deliveryAction(inventory, item.id, 'dispatch', { version: 1, clientRequestId: 'dispatch', reason: 'Checked all goods' }, 'tab-two'), { status: 409 }); assert.equal(f.balance(), '20.000');
});
test('release is token-scoped and cannot release the other tab', async () => {
    const f = await fixture(), item = await f.service.createDelivery(inventory, f.input()); await f.acquire(item, inventory, 'tab-one');
    await f.service.deliveryLease(inventory, item.id, 'tab-two', 'release'); await assert.rejects(f.acquire(item, inventory, 'tab-two'), { status: 409 });
    await f.service.deliveryLease(inventory, item.id, 'tab-one', 'release'); await f.acquire(item, inventory, 'tab-two'); assert.equal(f.state.leases[0].token, 'tab-two');
});
test('renewal uses database time and expired sessions cannot mutate or renew', async () => {
    const f = await fixture(), item = await f.service.createDelivery(inventory, f.input()); await f.acquire(item);
    f.state.now = new Date(f.state.now.getTime() + 60_000); await f.service.deliveryLease(inventory, item.id, 'editor', 'renew');
    assert.equal(f.state.leases[0].expiresAt.getTime() - f.state.now.getTime(), 90_000);
    f.state.now = new Date(f.state.now.getTime() + 90_001); await assert.rejects(f.action(item, 'dispatch'), { status: 409 });
    await assert.rejects(f.service.deliveryLease(inventory, item.id, 'editor', 'renew'), { status: 409 }); await f.acquire(item, inventory, 'replacement');
    await assert.rejects(f.action(item, 'dispatch'), { status: 409 });
});
test('permissions precede lease errors, and a different workshop has independent leases', async () => {
    const f = await fixture(), first = await f.service.createDelivery(inventory, f.input()), second = await f.service.createDelivery(inventory2, f.input());
    await f.acquire(first); await f.acquire(second, inventory2); assert.equal(f.state.leases.length, 2);
    await assert.rejects(f.service.deliveryLease(manager, first.id, 'manager-editor', 'acquire'), { status: 403 });
    await assert.rejects(f.action(first, 'return', [{ productId: 'pcs', quantity: '1' }], inventory2), { status: 403 });
});
