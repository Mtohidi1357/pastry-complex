import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pastry-return-')); for (const name of ['scripts', 'schema', 'prisma']) fs.mkdirSync(path.join(dir, name));
    const before = fs.readFileSync(path.join(root, 'prisma/schema.prisma.before-returns.bak'), 'utf8'); fs.writeFileSync(path.join(dir, 'prisma/schema.prisma'), before);
    for (const name of ['scripts/install-stock-returns.mjs', 'schema/stock-returns.prisma']) fs.copyFileSync(path.join(root, name), path.join(dir, name));
    return { dir, before, file: path.join(dir, 'prisma/schema.prisma'), run: (...args) => spawnSync(process.execPath, [path.join(dir, 'scripts/install-stock-returns.mjs'), ...args], { encoding: 'utf8' }) };
}
test('installer checks without writes, preserves the prior schema and is repeatable', () => {
    const f = fixture(); try { assert.equal(f.run('--check').status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), f.before); assert.equal(fs.existsSync(f.file + '.before-returns.bak'), false); assert.equal(f.run().status, 0); const installed = fs.readFileSync(f.file, 'utf8'); assert.equal(f.run().status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), installed); assert.equal(fs.readFileSync(f.file + '.before-returns.bak', 'utf8'), f.before); for (const name of ['WorkshopDelivery', 'StockCount', 'StockReturn', 'StockDocumentLease']) assert.match(installed, new RegExp('model ' + name + ' \\{')); } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
for (const variant of ['partial model', 'conflicting field', 'unknown movement']) test('installer rejects ' + variant + ' before writes', () => {
    const f = fixture(); try { const source = variant === 'partial model' ? f.before + '\nmodel StockReturn {\n id String @id\n}\n' : variant === 'conflicting field' ? f.before.replace('model StockMovement {', 'model StockMovement {\n returnId Int\n') : f.before.replace('enum StockMovementKind {', 'enum StockMovementKind {\n UNKNOWN_MOVEMENT\n'); fs.writeFileSync(f.file, source); assert.notEqual(f.run().status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), source); } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
test('migration adds three tables/nullable reference without historical data writes', () => {
    const sql = fs.readFileSync(path.join(root, 'prisma/migrations/20261108000100_stock_returns/migration.sql'), 'utf8'); assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 3); assert.match(sql, /UNIQUE INDEX `stock_return_events_clientRequestId_key`/); assert.match(sql, /ADD COLUMN `returnId` VARCHAR\(191\) NULL/); assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/im);
});
