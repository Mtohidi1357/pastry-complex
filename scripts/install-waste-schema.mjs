import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), file = path.join(root, 'prisma/schema.prisma');
const original = fs.readFileSync(file, 'utf8'), extra = fs.readFileSync(path.join(root, 'schema/waste.prisma'), 'utf8');
let source = original;
const names = [...extra.matchAll(/^(?:model|enum) (\w+)\s*\{/gm)].map(m => m[1]);
const present = names.filter(name => new RegExp('^(?:model|enum) ' + name + '\\s*\\{', 'm').test(source));
if (present.length && present.length !== names.length) throw Error('Partial waste schema found; no files changed.');
const additions = {
    Branch: ['wasteCases WasteCase[]'], Product: ['wasteLines WasteCaseLine[]'],
    User: ['wasteCreated WasteCase[] @relation("WasteCreator")', 'wasteApproved WasteCase[] @relation("WasteApprover")', 'wasteReversed WasteCase[] @relation("WasteReverser")', 'wasteEvents WasteCaseEvent[] @relation("WasteActor")'],
    StockMovement: ['wasteId String?', 'wasteCase WasteCase? @relation(fields: [wasteId], references: [id], onDelete: Restrict)', '@@index([wasteId])'],
};
for (const [name, fields] of Object.entries(additions)) {
    const pattern = new RegExp('(^model ' + name + '\\s*\\{)([\\s\\S]*?)(^\\})', 'm');
    if (!pattern.test(source)) throw Error('Missing ' + name + '; no files changed.');
    source = source.replace(pattern, (...parts) => {
        const [, opening, body, closing] = parts, missing = [];
        for (const field of fields) {
            if (field.startsWith('@@')) { if (!body.includes(field)) missing.push('  ' + field); continue; }
            const key = field.split(' ')[0], line = body.split(/\r?\n/).find(value => new RegExp('^\\s*' + key + '\\s').test(value));
            if (line && line.trim().replace(/\s+/g, ' ') !== field) throw Error('Conflicting ' + name + '.' + key + '; no files changed.');
            if (!line) missing.push('  ' + field);
        }
        return opening + body + (missing.length ? '\n' + missing.join('\n') + '\n' : '') + closing;
    });
}
const pattern = /^enum StockMovementKind\s*\{([\s\S]*?)^\}/m, match = pattern.exec(source);
if (!match) throw Error('Missing stock movement enum; no files changed.');
const expected = ['RECEIPT', 'RECEIPT_REVERSAL', 'OPENING_BALANCE', 'COUNT_ADJUSTMENT'], added = ['WASTE', 'WASTE_REVERSAL'];
const values = match[1].split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('//'));
if (expected.some(value => !values.includes(value)) || values.some(value => ![...expected, ...added].includes(value))) throw Error('Unexpected movement enum. Share your current schema before applying this migration; no files changed.');
source = source.replace(pattern, () => 'enum StockMovementKind {' + match[1] + added.filter(value => !values.includes(value)).map(value => '  ' + value + '\n').join('') + '}');
if (!present.length) source += '\n\n' + extra + '\n';
if (source === original) { console.log('Waste schema already installed.'); process.exit(0); }
if (process.argv.includes('--check')) { console.log('Waste schema can be installed; no files changed.'); process.exit(0); }
const backup = file + '.before-waste.bak';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, { flag: 'wx' });
fs.writeFileSync(file, source);
console.log('Waste models/relations added; previous schema preserved.');
