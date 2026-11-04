import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = path.join(root, 'src/app/layout.tsx');
const original = fs.readFileSync(layout, 'utf8');
if (!original.includes('next/font/google')) {
    console.log('No Google font import in root layout; no files changed.');
    process.exit(0);
}
const patterns = [
    /import\s*\{\s*Geist\s*,\s*Geist_Mono\s*\}\s*from\s*["']next\/font\/google["'];?\s*/,
    /const\s+geistSans\s*=\s*Geist\(\{[\s\S]*?\}\);?\s*/,
    /const\s+geistMono\s*=\s*Geist_Mono\(\{[\s\S]*?\}\);?\s*/,
];
let source = original;
for (const pattern of patterns) {
    if (!pattern.test(source)) throw Error('Font setup differs from the expected Geist layout. No files changed; share src/app/layout.tsx.');
    source = source.replace(pattern, '');
}
source = source.replace(/\$\{geistSans\.variable\}\s*/g, '').replace(/\$\{geistMono\.variable\}\s*/g, '');
if (/\b(?:geistSans|geistMono|Geist|Geist_Mono)\b|next\/font\/google/.test(source)) throw Error('Additional font references found. No files changed; share src/app/layout.tsx.');
if (!source.includes('"./system-fonts.css"') && !source.includes("'./system-fonts.css'")) source = 'import "./system-fonts.css";\n' + source;
// Keep existing providers, metadata, layout markup and theme styles intact.
const css = ':root {\n  --font-geist-sans: Arial, Helvetica, sans-serif;\n  --font-geist-mono: "Courier New", Courier, monospace;\n}\n';
const cssPath = path.join(root, 'src/app/system-fonts.css');
if (fs.existsSync(cssPath) && fs.readFileSync(cssPath, 'utf8') !== css) throw Error('system-fonts.css already has custom content; no files changed.');
const backup = layout + '.before-system-fonts.bak';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, { flag: 'wx' });
fs.writeFileSync(cssPath, css);
fs.writeFileSync(layout, source);
console.log('Root layout now uses system font variables without Google font downloads. Existing layout backed up.');
