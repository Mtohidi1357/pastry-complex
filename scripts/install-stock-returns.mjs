import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'prisma/schema.prisma');
const original = fs.readFileSync(file, 'utf8');
const extra = fs.readFileSync(path.join(root, 'schema/stock-returns.prisma'), 'utf8');
let source = original;
for (const required of ['WorkshopReceipt', 'WorkshopDelivery', 'StockMovement', 'BranchStockBalance', 'StockDocumentLease']) {
    if (!new RegExp('^model ' + required + '\\s*\\{', 'm').test(source)) throw Error('Missing ' + required + '. Install the tested workshop/counts/dispatch packages first. No files changed.');
}
const definitions = [...extra.matchAll(/^(model|enum) (\w+)\s*\{([\s\S]*?)^\}/gm)];
const present = definitions.filter(([, kind, name]) => new RegExp('^' + kind + ' ' + name + '\\s*\\{', 'm').test(source));
if (present.length && present.length !== definitions.length) throw Error('Partial returns schema found. No files changed.');
const normalize = value => value.trim().replace(/\s+/g, ' ');
for (const [, kind, name, expected] of present) {
    const body = new RegExp('^' + kind + ' ' + name + '\\s*\\{([\\s\\S]*?)^\\}', 'm').exec(source)[1];
    const lines = body.split(/\r?\n/).map(normalize).filter(Boolean);
    for (const line of expected.split(/\r?\n/).map(normalize).filter(Boolean)) if (!lines.includes(line)) throw Error('Conflicting ' + name + ' definition. No files changed.');
}
const additions = {
    Branch: ['returnsSent StockReturn[] @relation("ReturnSource")', 'returnsReceived StockReturn[] @relation("ReturnDestination")'],
    Product: ['stockReturnLines StockReturnLine[]'],
    DailyRequest: ['stockReturns StockReturn[]'],
    User: ['returnsCreated StockReturn[] @relation("ReturnCreator")', 'returnsDispatched StockReturn[] @relation("ReturnDispatcher")', 'returnEvents StockReturnEvent[]'],
    StockMovement: ['returnId String?', 'stockReturn StockReturn? @relation(fields: [returnId], references: [id], onDelete: Restrict)', '@@index([returnId])'],
};
for (const [name, fields] of Object.entries(additions)) {
    const pattern = new RegExp('(^model ' + name + '\\s*\\{)([\\s\\S]*?)(^\\})', 'm');
    if (!pattern.test(source)) throw Error('Missing ' + name + '. No files changed.');
    source = source.replace(pattern, (_, opening, body, closing) => {
        const lines = body.split(/\r?\n/), missing = [];
        for (const field of fields) {
            const existing = lines.find(line => field.startsWith('@@') ? normalize(line) === field : new RegExp('^\\s*' + field.split(' ')[0] + '\\s').test(line));
            if (existing && normalize(existing) !== field) throw Error('Conflicting ' + name + '.' + field.split(' ')[0] + '. No files changed.');
            if (!existing) missing.push('  ' + field);
        }
        return opening + body + (missing.length ? '\n' + missing.join('\n') + '\n' : '') + closing;
    });
}
const pattern = /^enum StockMovementKind\s*\{([\s\S]*?)^\}/m, match = pattern.exec(source);
if (!match) throw Error('Missing StockMovementKind. No files changed.');
const expected = ['RECEIPT', 'RECEIPT_REVERSAL', 'OPENING_BALANCE', 'COUNT_ADJUSTMENT', 'WASTE', 'WASTE_REVERSAL', 'PRODUCTION', 'PRODUCTION_REVERSAL', 'DISPATCH', 'DELIVERY_RECEIVING', 'DISPATCH_RETURN'];
const added = ['RETURN_DISPATCH', 'RETURN_RECEIVING', 'RETURN_RESTORE'];
const values = match[1].split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('//'));
if (expected.some(value => !values.includes(value)) || values.some(value => ![...expected, ...added].includes(value))) throw Error('Unexpected movement enum. No files changed; share your schema before applying.');
source = source.replace(pattern, () => 'enum StockMovementKind {' + match[1] + added.filter(value => !values.includes(value)).map(value => '  ' + value + '\n').join('') + '}');
if (!present.length) source += '\n\n' + extra + '\n';
if (source === original) { console.log('Returns schema already installed.'); process.exit(0); }
if (process.argv.includes('--check')) { console.log('Returns schema can be installed. No files changed.'); process.exit(0); }
const backup = file + '.before-returns.bak';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, { flag: 'wx' });
fs.writeFileSync(file, source);
console.log('Stock return models and movement reference added. Prior schema preserved. Database not modified.');
