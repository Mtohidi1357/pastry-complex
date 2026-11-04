import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'prisma/schema.prisma');
const original = fs.readFileSync(file, 'utf8');
let source = original;
const definition = 'trackingNumber Int @unique @default(autoincrement())';
for (const model of ['User', 'DailyRequest', 'StockReceipt', 'StockCount']) {
    const pattern = new RegExp('(^model ' + model + '\\s*\\{)([\\s\\S]*?)(^\\})', 'm');
    if (!pattern.test(source)) throw Error('Missing ' + model + ' model; no files changed.');
    source = source.replace(pattern, (...parts) => {
        const [, opening, body, closing] = parts;
        const existing = body.split(/\r?\n/).find(line => /^\s*trackingNumber\s/.test(line));
        if (existing) {
            if (existing.trim().replace(/\s+/g, ' ') !== definition) throw Error('Conflicting ' + model + '.trackingNumber; no files changed.');
            return opening + body + closing;
        }
        return opening + '\n  ' + definition + body + closing;
    });
}
if (source === original) { console.log('Tracking numbers already installed.'); process.exit(0); }
if (process.argv.includes('--check')) { console.log('Tracking numbers can be installed; no files changed.'); process.exit(0); }
const backup = file + '.before-tracking-numbers.bak';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, { flag: 'wx' });
fs.writeFileSync(file, source);
console.log('Tracking-number fields added. Existing IDs and relations preserved.');
