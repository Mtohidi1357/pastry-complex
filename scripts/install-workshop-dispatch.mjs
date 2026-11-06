import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'prisma/schema.prisma');
const original = fs.readFileSync(file, 'utf8');
const extra = fs.readFileSync(path.join(root, 'schema/workshop-dispatch.prisma'), 'utf8');
let source = original;
for (const required of ['WorkshopReceipt', 'StockMovement', 'BranchStockBalance', 'RequestEditLease']) {
    if (!new RegExp('^model ' + required + '\\s*\\{', 'm').test(source)) throw Error('Missing ' + required + '. Install the tested workshop package first. No files changed.');
}
const definitions = [...extra.matchAll(/^(model|enum) (\w+)\s*\{([\s\S]*?)^\}/gm)];
const present = definitions.filter(([, kind, name]) => new RegExp('^' + kind + ' ' + name + '\\s*\\{', 'm').test(source));
if (present.length && present.length !== definitions.length) throw Error('Partial dispatch schema found. No files changed.');
const normalize = value => value.trim().replace(/\s+/g, ' ');
for (const [, kind, name, expected] of present) {
    const body = new RegExp('^' + kind + ' ' + name + '\\s*\\{([\\s\\S]*?)^\\}', 'm').exec(source)[1];
    const lines = body.split(/\r?\n/).map(normalize).filter(Boolean);
    for (const line of expected.split(/\r?\n/).map(normalize).filter(Boolean)) if (!lines.includes(line)) throw Error('Conflicting ' + name + ' definition. No files changed.');
}
const additions = {
    Branch: ['outgoingDeliveries WorkshopDelivery[] @relation("DeliverySource")', 'incomingDeliveries WorkshopDelivery[] @relation("DeliveryDestination")'],
    Product: ['deliveryLines WorkshopDeliveryLine[]'],
    DailyRequest: ['workshopDelivery WorkshopDelivery?'],
    User: ['deliveriesCreated WorkshopDelivery[] @relation("DeliveryCreator")', 'deliveriesDispatched WorkshopDelivery[] @relation("DeliveryDispatcher")', 'deliveryEvents WorkshopDeliveryEvent[]', 'stockDocumentLeases StockDocumentLease[]'],
    StockMovement: ['deliveryId String?', 'delivery WorkshopDelivery? @relation(fields: [deliveryId], references: [id], onDelete: Restrict)', '@@index([deliveryId])'],
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
const expected = ['RECEIPT', 'RECEIPT_REVERSAL', 'OPENING_BALANCE', 'COUNT_ADJUSTMENT', 'WASTE', 'WASTE_REVERSAL', 'PRODUCTION', 'PRODUCTION_REVERSAL'];
const added = ['DISPATCH', 'DELIVERY_RECEIVING', 'DISPATCH_RETURN'];
const values = match[1].split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('//'));
if (expected.some(value => !values.includes(value)) || values.some(value => ![...expected, ...added].includes(value))) throw Error('Unexpected movement enum. No files changed; share your schema before applying.');
source = source.replace(pattern, () => 'enum StockMovementKind {' + match[1] + added.filter(value => !values.includes(value)).map(value => '  ' + value + '\n').join('') + '}');
if (!present.length) source += '\n\n' + extra + '\n';
if (source === original) { console.log('Dispatch schema already installed.'); process.exit(0); }
if (process.argv.includes('--check')) { console.log('Dispatch schema can be installed. No files changed.'); process.exit(0); }
const backup = file + '.before-dispatch.bak';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, { flag: 'wx' });
fs.writeFileSync(file, source);
console.log('Dispatch/lease models added. Prior schema preserved. Database not modified.');
