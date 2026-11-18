import test from 'node:test';
import assert from 'node:assert/strict';
import { salesFixture, inv, other, manager, admin } from './sales-harness.mjs';
const denied = error => error.status === 403;
const conflict = error => error.status === 409;
test('draft and submit leave stock untouched; post subtracts once and audits', async () => {
 const f = await salesFixture(); const item = await f.submitted(); assert.equal(f.balance(), '20.000'); assert.equal(f.state.movements.length, 0);
 const body = f.actionInput(item), posted = await f.action(item, 'post', manager, body); assert.equal(posted.status, 'POSTED'); assert.equal(f.balance(), '15.000'); assert.equal(f.state.movements[0].kind, 'SALE'); assert.equal(f.state.movements[0].salesReportId, item.id);
 await f.service.salesLease(manager, item.id, 'editor', 'release'); await f.action(posted, 'post', manager, body); assert.equal(f.state.movements.length, 1); assert.equal(f.state.salesEvents.filter(e => e.action === 'POST').length, 1);
});
test('duplicate date blocked with reference, create retry allowed, branch and date independent', async () => {
 const f = await salesFixture(), input = f.input(); const first = await f.service.createSales(inv, input); assert.equal((await f.service.createSales(inv, input)).id, first.id);
 await assert.rejects(f.service.createSales(inv, f.input()), e => conflict(e) && e.message.includes('SLS-'));
 await f.service.createSales(other, f.input()); await f.service.createSales(inv, f.input('5', { businessDate: '2030-01-02' })); assert.equal(f.state.days.length, 3);
 await assert.rejects(f.service.createSales(inv, { ...input, note: 'changed' }), conflict);
});
test('simultaneous creates leave one active report', async () => {
 const f = await salesFixture(); const results = await Promise.allSettled([f.service.createSales(inv, f.input()), f.service.createSales(inv, f.input())]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.state.reports.length, 1);
});
test('permissions precede lease; admin read-only, cross branch and workshop denied', async () => {
 const f = await salesFixture(), item = await f.service.createSales(inv, f.input());
 for (const user of [other, admin, { ...inv, roleCode: 'WM' }]) await assert.rejects(f.action(item, 'cancel', user), denied);
 assert.equal((await f.service.salesDetail(admin, item.id)).id, item.id); await assert.rejects(f.service.salesDetail(other, item.id), denied);
 await assert.rejects(f.service.createSales(manager, f.input()), denied); await assert.rejects(f.service.salesOptions({ id: 'inv-ws01', branchId: 'WS01', roleCode: 'INV' }), denied);
});
test('inactive or stale-role account rejected', async () => {
 const f = await salesFixture(); f.state.users.find(u => u.id === inv.id).isActive = false; await assert.rejects(f.service.createSales(inv, f.input()), denied);
 f.state.users.find(u => u.id === inv.id).isActive = true; f.state.users.find(u => u.id === inv.id).role.code = 'BM'; await assert.rejects(f.service.createSales(inv, f.input()), denied);
});
test('lease blocks second tab before editing and expires on database clock', async () => {
 const f = await salesFixture(), item = await f.service.createSales(inv, f.input()); await f.acquire(item);
 await assert.rejects(f.acquire(item, inv, 'second'), e => conflict(e) && e.message.includes('another tab'));
 f.state.now = new Date(f.state.now.getTime() + 91_000); await assert.rejects(f.action(item, 'submit'), conflict);
 await f.acquire(item, inv, 'second'); await assert.rejects(f.action(item, 'submit'), conflict);
 assert.equal((await f.action(item, 'submit', inv, f.actionInput(item), 'second')).status, 'SUBMITTED');
});
test('save stale version rejected, matching save retry idempotent', async () => {
 const f = await salesFixture(), item = await f.service.createSales(inv, f.input()); await f.acquire(item);
 const body = { note: 'Updated totals', lines: [{ productId: 'pcs', quantity: '7' }], version: item.version, clientRequestId: 'save-token' };
 const saved = await f.service.saveSales(inv, item.id, body, 'editor'); assert.equal(saved.version, 2); await f.service.saveSales(inv, item.id, body, 'editor'); assert.equal(f.state.salesEvents.filter(e => e.action === 'SAVED').length, 1);
 await assert.rejects(f.service.saveSales(inv, item.id, { ...body, clientRequestId: 'another' }, 'editor'), conflict); assert.equal(f.balance(), '20.000');
});
test('manager can return draft for original inventory to edit', async () => {
 const f = await salesFixture(), item = await f.submitted(); const draft = await f.action(item, 'review', manager); assert.equal(draft.status, 'DRAFT');
 await f.service.salesLease(manager, draft.id, 'editor', 'release'); await f.acquire(draft); assert.equal((await f.action(draft, 'submit')).status, 'SUBMITTED');
});
test('shortage rolls back earlier product, status, movement and revision', async () => {
 const f = await salesFixture(), item = await f.submitted(f.input('5', { lines: [{ productId: 'kg', quantity: '1' }, { productId: 'pcs', quantity: '21' }] }));
 await assert.rejects(f.action(item, 'post', manager), conflict); assert.equal(f.balance('kg'), '2.000'); assert.equal(f.state.balances.find(b => b.branchId === 'BR01' && b.productId === 'kg').revision, 1); assert.equal(f.state.movements.length, 0); assert.equal(f.state.reports[0].status, 'SUBMITTED');
});
test('audit failure rolls back posting and preserves daily slot', async () => {
 const f = await salesFixture(), item = await f.submitted(); f.state.failAudit = true; await assert.rejects(f.action(item, 'post', manager), /audit failed/); assert.equal(f.balance(), '20.000'); assert.equal(f.state.movements.length, 0); assert.equal(f.state.days[0].activeReportId, item.id);
});
test('exact fractional sales, integer pieces and zero-only day', async () => {
 const f = await salesFixture(); const p = await f.posted(f.input('0', { lines: [{ productId: 'kg', quantity: '0.125' }, { productId: 'pcs', quantity: '0' }] })); assert.equal(p.status, 'POSTED'); assert.equal(f.balance('kg'), '1.875'); assert.equal(f.balance(), '20.000'); assert.equal(f.state.movements.length, 1);
 const g = await salesFixture(); await assert.rejects(g.service.createSales(inv, g.input('1.001')), /whole/); await g.posted(g.input('0')); assert.equal(g.state.movements.length, 0); assert.equal(g.balance(), '20.000');
});
test('invalid products, repeated products and impossible date rejected', async () => {
 const f = await salesFixture(); for (const body of [f.input('-1'), f.input('1', { businessDate: '2030-02-30' }), f.input('1', { lines: [{ productId: 'pcs', quantity: '1' }, { productId: 'pcs', quantity: '1' }] }), f.input('1', { lines: [{ productId: 'missing', quantity: '1' }] })]) await assert.rejects(f.service.createSales(inv, body)); assert.equal(f.state.reports.length, 0);
});
test('reversal restores once, preserves original, frees daily slot for linked replacement', async () => {
 const f = await salesFixture(), p = await f.posted(); const body = f.actionInput(p); const reversed = await f.action(p, 'reverse', manager, body); assert.equal(reversed.status, 'REVERSED'); assert.equal(f.balance(), '20.000'); assert.equal(f.state.movements.length, 2); assert.equal(f.state.movements[1].originalMovementId, f.state.movements[0].id); assert.equal(f.state.days[0].activeReportId, null);
 await f.action(reversed, 'reverse', manager, body); assert.equal(f.state.movements.length, 2);
 const replacement = await f.service.createSales(inv, f.input('3', { correctsReportId: p.id })); assert.notEqual(replacement.id, p.id); assert.equal(replacement.corrects.id, p.id); assert.equal(f.state.days[0].activeReportId, replacement.id);
});
test('bad original movement prevents reversal without partial changes', async () => {
 const f = await salesFixture(), p = await f.posted(); f.state.movements[0].quantityDelta = '-4.000'; await assert.rejects(f.action(p, 'reverse', manager), conflict); assert.equal(f.balance(), '15.000'); assert.equal(f.state.reports[0].status, 'POSTED');
});
test('cancel keeps audit and frees date; submitted cancellation denied', async () => {
 const f = await salesFixture(), item = await f.service.createSales(inv, f.input()); await f.acquire(item); const c = await f.action(item, 'cancel'); assert.equal(c.status, 'CANCELLED'); await f.service.createSales(inv, f.input()); assert.equal(f.state.reports.length, 2); assert.equal(f.state.movements.length, 0);
 const g = await salesFixture(), s = await g.submitted(); await assert.rejects(g.action(s, 'cancel'), conflict);
});
test('self approval denied after account role changes', async () => {
 const f = await salesFixture(), item = await f.service.createSales(inv, f.input()); await f.acquire(item); const s = await f.action(item, 'submit'); f.state.users.find(u => u.id === inv.id).role.code = 'BM'; await assert.rejects(f.action(s, 'post', { ...inv, roleCode: 'BM' }), denied);
});
test('posting rechecks product activity; reversal allows deactivated products', async () => {
 const f = await salesFixture(), s = await f.submitted(); f.state.products[0].isActive = false; await assert.rejects(f.action(s, 'post', manager));
 f.state.products[0].isActive = true; const p = await f.action(s, 'post', manager); f.state.products[0].isActive = false; await f.action(p, 'reverse', manager); assert.equal(f.balance(), '20.000');
});
test('list filters own branch, admin branch/date and manager submitted queue', async () => {
 const f = await salesFixture(); const p = await f.posted(); await f.service.createSales(other, f.input()); const draft = await f.service.createSales(inv, f.input('1', { businessDate: '2030-01-02' }));
 assert.equal((await f.service.salesList(inv, 1)).totalItems, 1); assert.equal((await f.service.salesList(admin, 1, true)).totalItems, 3);
 assert.equal((await f.service.salesList(admin, 1, true, undefined, 'BR01', '2030-01-01')).items[0].id, p.id);
 assert.equal((await f.service.salesList(manager, 1, false, undefined, undefined, undefined, 'SUBMITTED')).totalItems, 0);
 await f.acquire(draft); await f.action(draft, 'submit'); assert.equal((await f.service.salesList(manager, 1, false, undefined, undefined, undefined, 'SUBMITTED')).totalItems, 1);
 await assert.rejects(f.service.salesList(inv, 1, true, undefined, 'BR02'), denied);
});
test('nonzero post/reversal invalidate stock snapshot revision; zero does not', async () => {
 const f = await salesFixture(), p = await f.posted(); assert.equal(f.state.balances.find(b => b.branchId === 'BR01' && b.productId === 'pcs').revision, 2);
 await f.action(p, 'reverse', manager); assert.equal(f.state.balances.find(b => b.branchId === 'BR01' && b.productId === 'pcs').revision, 3);
 const g = await salesFixture(); await g.posted(g.input('0')); assert.equal(g.state.balances.find(b => b.branchId === 'BR01' && b.productId === 'pcs').revision, 1);
});
test('concurrent manager confirmation with same token posts only once; changed token rejected', async () => {
 const f = await salesFixture(), s = await f.submitted(), body = f.actionInput(s); const results = await Promise.all([f.action(s, 'post', manager, body), f.action(s, 'post', manager, body)]); assert.equal(results[0].id, results[1].id); assert.equal(f.state.movements.length, 1); assert.equal(f.balance(), '15.000'); await assert.rejects(f.action(results[0], 'post', manager), conflict);
 await assert.rejects(f.action(results[0], 'post', manager, { ...body, reason: 'Changed operation body' }), conflict);
});
test('reversal audit failure rolls back balances, movements, status and date slot', async () => {
 const f = await salesFixture(), p = await f.posted(); f.state.failAudit = true; await assert.rejects(f.action(p, 'reverse', manager), /audit failed/); assert.equal(f.balance(), '15.000'); assert.equal(f.state.movements.length, 1); assert.equal(f.state.days[0].activeReportId, p.id); assert.equal(f.state.reports[0].status, 'POSTED');
});
