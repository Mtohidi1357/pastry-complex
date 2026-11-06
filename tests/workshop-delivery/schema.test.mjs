import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pastry-dispatch-'));
    for (const name of ['scripts', 'schema', 'prisma']) fs.mkdirSync(path.join(dir, name));
    const before = fs.readFileSync(path.join(root, 'prisma/schema.prisma.before-dispatch.bak'), 'utf8');
    fs.writeFileSync(path.join(dir, 'prisma/schema.prisma'), before);
    for (const name of ['scripts/install-workshop-dispatch.mjs', 'schema/workshop-dispatch.prisma']) fs.copyFileSync(path.join(root, name), path.join(dir, name));
    return { dir, before, file: path.join(dir, 'prisma/schema.prisma'), run: (...args) => spawnSync(process.execPath, [path.join(dir, 'scripts/install-workshop-dispatch.mjs'), ...args], { encoding: 'utf8' }) };
}
test('installer preserves existing schema, backs it up once and is repeatable after formatting', () => {
    const f = fixture(); try {
        assert.equal(f.run('--check').status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), f.before); assert.equal(fs.existsSync(f.file + '.before-dispatch.bak'), false);
        assert.equal(f.run().status, 0); const installed = fs.readFileSync(f.file, 'utf8');
        for (const name of ['WorkshopReceipt', 'StockReceipt', 'StockCount', 'WasteCase', 'ProductImage', 'RequestEditLease', 'WorkshopDelivery', 'StockDocumentLease']) assert.match(installed, new RegExp('model ' + name + ' \\{'));
        assert.equal(fs.readFileSync(f.file + '.before-dispatch.bak', 'utf8'), f.before);
        assert.equal(f.run().status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), installed);
        const formatted = installed.replace('sourceBranchId String', 'sourceBranchId    String'); fs.writeFileSync(f.file, formatted); assert.equal(f.run().status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), formatted);
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
for (const variant of ['partial models', 'conflicting field', 'unknown movement']) test('installer rejects ' + variant + ' before any writes', () => {
    const f = fixture(); try {
        const value = variant === 'partial models' ? f.before + '\nmodel StockDocumentLease {\n key String @id\n}\n' : variant === 'conflicting field' ? f.before.replace('model StockMovement {', 'model StockMovement {\n deliveryId Int\n') : f.before.replace('enum StockMovementKind {', 'enum StockMovementKind {\n UNKNOWN_STOCK_EVENT\n');
        fs.writeFileSync(f.file, value); assert.notEqual(f.run().status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), value); assert.equal(fs.existsSync(f.file + '.before-dispatch.bak'), false);
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
test('migration is additive and makes retry/one-request keys unique', () => {
    const sql = fs.readFileSync(path.join(root, 'prisma/migrations/20261105000100_workshop_dispatch/migration.sql'), 'utf8');
    assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 4);
    assert.match(sql, /UNIQUE INDEX `workshop_deliveries_sourceRequestId_key`/); assert.match(sql, /UNIQUE INDEX `workshop_delivery_events_clientRequestId_key`/);
    assert.match(sql, /ADD COLUMN `deliveryId` VARCHAR\(191\) NULL/); assert.match(sql, /'DISPATCH','DELIVERY_RECEIVING','DISPATCH_RETURN'/);
    assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/im);
});
