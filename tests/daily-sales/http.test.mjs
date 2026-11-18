import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './stock-harness.mjs';
import { load } from './stock-harness.mjs';
import { inv as salesInventory } from './sales-harness.mjs';
async function http(deny = false) {
    class ZodError extends Error {}
    return load('src/features/sales/salesHttp.ts', {
        '../auth/authMiddleware': { authenticate: async () => { if (deny) throw new AppError('AUTHENTICATION_ERROR', 'Sign in required', 401); return salesInventory; } },
        '@/lib/centralResponse': { success: (data, status = 200) => Response.json({ success: true, data }, { status }), failure: (code, message, status) => Response.json({ success: false, error: { code, message } }, { status }) }, zod: { ZodError },
    });
}
test('sales HTTP authentication precedes every operation and authenticated replies are private', async () => {
    const denied = await http(true); let called = false; const response = await denied.salesHttp({}, async () => { called = true; }); assert.equal(response.status, 401); assert.equal(called, false);
    const allowed = await http(); const result = await allowed.salesHttp({}, async user => ({ actor: user.id }), 201); assert.equal(result.status, 201); assert.equal(result.headers.get('cache-control'), 'private, no-store');
});
test('action route forwards parsed version and editor token; list defaults omitted finished flag', async () => {
    const calls = [], helper = { salesHttp: async (req, operation) => operation(salesInventory) };
    const route = await load('src/app/api/sales/[id]/[action]/route.ts', {
        '@/features/sales/salesHttp': helper, '@/features/sales/salesService': { actOnSales: async (...args) => { calls.push(args); return {}; }, salesLease: async () => ({}) },
        '@/features/sales/salesValidation': { salesActionBody: { parse: value => value } }, '@/features/delivery/deliveryValidation': { deliveryLeaseBody: { parse: value => value } }, zod: { z: { uuid: () => ({ parse: value => value }), enum: () => ({ parse: value => value }) } },
    });
    await route.POST({ headers: new Headers({ 'X-Stock-Edit-Token': 'editor' }), json: async () => ({ version: 2 }) }, { params: Promise.resolve({ id: 'return-id', action: 'submit' }) }); assert.equal(calls[0][1], 'return-id'); assert.equal(calls[0][3].version, 2); assert.equal(calls[0][4], 'editor');
    const list = await load('src/app/api/sales/route.ts', { '@/features/sales/salesHttp': helper, '@/features/sales/salesService': { salesList: async (...args) => { calls.push(args); }, createSales: async () => ({}) }, '@/features/sales/salesValidation': { salesQuery: { parse: () => ({ page: 1 }) }, salesCreateBody: { parse: value => value } } });
    await list.GET({ nextUrl: { searchParams: new URLSearchParams() } }); assert.equal(calls.at(-1)[2], false);
});
