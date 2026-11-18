import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pastry-sales-'));
    for (const name of ['scripts', 'schema', 'prisma']) fs.mkdirSync(path.join(dir, name));
    const current = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
    const before = /^model SalesReport\s*\{/m.test(current) ? fs.readFileSync(path.join(root, 'prisma/schema.prisma.before-sales.bak'), 'utf8') : current;
    fs.writeFileSync(path.join(dir, 'prisma/schema.prisma'), before);
    for (const name of ['scripts/install-daily-sales.mjs', 'schema/daily-sales.prisma']) fs.copyFileSync(path.join(root, name), path.join(dir, name));
    return { dir, before, file: path.join(dir, 'prisma/schema.prisma'), run: (...args) => spawnSync(process.execPath, [path.join(dir, 'scripts/install-daily-sales.mjs'), ...args], { encoding: 'utf8' }) };
}
test('installer dry-run preserves schema; installation repeatable and named relation pairs complete', () => {
 const f = fixture(); try {
  assert.equal(f.run('--check').status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), f.before); assert.equal(fs.existsSync(f.file + '.before-sales.bak'), false);
  assert.equal(f.run().status, 0); const installed = fs.readFileSync(f.file, 'utf8');
  for (const name of ['SalesCreator','SalesPoster','SalesReverser','SalesActor','SalesCorrections','ActiveSalesReport','SalesDayReports']) assert.equal((installed.match(new RegExp('@relation\\("'+name+'"','g')) ?? []).length, 2, name);
  assert.equal(f.run().status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), installed); assert.equal(fs.readFileSync(f.file + '.before-sales.bak', 'utf8'), f.before);
  assert.match(installed, /@@unique\(\[branchId, businessDate\]\)/); assert.doesNotMatch(installed, /returnsReturnsed|ReturnReturnser/);
 } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
for (const variant of ['partial model','conflicting field','unknown movement']) test('installer rejects '+variant+' before writing', () => {
 const f = fixture(); try {
  const source = variant === 'partial model' ? f.before + '\nmodel SalesReport {\n id String @id\n}\n' : variant === 'conflicting field' ? f.before.replace('model StockMovement {','model StockMovement {\n salesReportId Int\n') : f.before.replace('enum StockMovementKind {','enum StockMovementKind {\n UNKNOWN_MOVEMENT\n');
  fs.writeFileSync(f.file, source); assert.notEqual(f.run().status, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), source); assert.equal(fs.existsSync(f.file+'.before-sales.bak'), false);
 } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
test('migration adds four tables with nullable movement reference, no historical DML', () => {
 const sql = fs.readFileSync(path.join(root,'prisma/migrations/20261111000100_daily_sales/migration.sql'),'utf8');
 assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 4); assert.match(sql, /UNIQUE INDEX `sales_days_branchId_businessDate_key`/); assert.match(sql, /UNIQUE INDEX `sales_report_events_clientRequestId_key`/); assert.match(sql, /ADD COLUMN `salesReportId` VARCHAR\(191\) NULL/); assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/im);
});
