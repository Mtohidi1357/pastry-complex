import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, workshop } from './stock-harness.mjs';
test('count GET routes admit WM using the count policy and default omitted finished flag', async () => {
    const calls = [], policy = await load('src/features/stock/countPolicy.ts');
    const helper = { stockHttp: async (req, operation) => operation(workshop) };
    const route = await load('src/app/api/stock-counts/route.ts', {
        '@/features/stock/stockHttp': helper, '@/features/stock/countPolicy': policy,
        '@/features/stock/countService': { countRole() {}, listCounts: async (...args) => { calls.push(args); return {}; }, startCount() {} },
        '@/features/stock/countValidation': { countQuery: { parse: () => ({ page: 1 }) }, startCountBody: { parse: value => value } },
    });
    await route.GET({ nextUrl: { searchParams: new URLSearchParams() } });
    assert.equal(calls[0][0].roleCode, 'WM'); assert.equal(calls[0][3], false);
    const detail = await load('src/app/api/stock-counts/[id]/route.ts', {
        '@/features/stock/stockHttp': helper, '@/features/stock/countPolicy': policy,
        '@/features/stock/countService': { countRole() {}, saveCount() {}, countDetail: async (user, id) => { assert.equal(user.roleCode, 'WM'); return { id }; } },
        '@/features/stock/countValidation': { saveCountBody: { parse: value => value } }, zod: { z: { uuid: () => ({ parse: value => value }) } },
    });
    assert.equal((await detail.GET({}, { params: Promise.resolve({ id: 'count-id' }) })).id, 'count-id');
});
