import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = 'src/features/dailyRequest/';
const targets = [
    ['components/RequestQuantityForm.tsx', 'requested', '../WorkflowFormFrame'],
    ['components/ProductionForm.tsx', 'production', '../WorkflowFormFrame'],
    ['components/ReceivingForm.tsx', 'receiving', '../WorkflowFormFrame'],
    ['DailyRequestForm.tsx', 'new', './WorkflowFormFrame'],
    ['NewRequestPageClient.tsx', 'page', './WorkflowFormFrame'],
];
const marker = '// Pastry workflow design wrapper v1';
for (const file of ['WorkflowFormFrame.tsx', 'WorkflowFormFrame.module.css']) {
    if (!fs.existsSync(path.join(root, folder, file))) throw Error('Copy the src folder from this update first. Missing ' + file);
}
const updates = [];
for (const [relative, stage, importPath] of targets) {
    const file = path.join(root, folder, relative);
    const original = fs.readFileSync(file, 'utf8');
    if (original.includes(marker)) {
        if (!original.includes('import WorkflowFormFrame from "' + importPath + '"') || !original.includes('stage="' + stage + '"')) throw Error('Partial existing wrapper in ' + relative + '; no files changed.');
        continue;
    }
    if (/\bWorkflowFormFrame\b/.test(original)) throw Error('Custom WorkflowFormFrame reference in ' + relative + '; no files changed.');
    const defaults = [...original.matchAll(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g)];
    const directive = /^(\s*["']use client["'];?\s*)/.exec(original);
    if (defaults.length !== 1 || !directive) throw Error('Unexpected component format in ' + relative + '; no files changed. Share that file for a tailored update.');
    const name = defaults[0][1], wrapperName = 'Styled' + name;
    if (new RegExp('\\b' + wrapperName + '\\b').test(original)) throw Error('Wrapper name already used in ' + relative + '; no files changed.');
    let source = original.replace(defaults[0][0], 'function ' + name + '(');
    source = source.slice(0, directive[0].length) + 'import WorkflowFormFrame from "' + importPath + '";\n' + source.slice(directive[0].length);
    source += '\n\n' + marker + '\nexport default function ' + wrapperName + '(props: Parameters<typeof ' + name + '>[0]) {\n    return <WorkflowFormFrame stage="' + stage + '"><' + name + ' {...props} /></WorkflowFormFrame>;\n}\n';
    updates.push({ relative, file, original, source });
}
if (!updates.length) { console.log('Workflow form design already installed.'); process.exit(0); }
if (process.argv.includes('--check')) { console.log('Ready to style ' + updates.length + ' existing components; no files changed.'); process.exit(0); }
const backupRoot = path.join(root, '.workflow-form-backups');
fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, '.gitignore'), '*\n');
for (const update of updates) {
    const backup = path.join(backupRoot, update.relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, update.original, { flag: 'wx' });
}
for (const update of updates) fs.writeFileSync(update.file, update.source);
console.log('Styled ' + updates.length + ' existing components. Business logic preserved; backups in .workflow-form-backups.');
