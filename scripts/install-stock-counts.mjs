import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),file=path.join(root,'prisma/schema.prisma');
const original=fs.readFileSync(file,'utf8'),extra=fs.readFileSync(path.join(root,'schema/stock-counts.prisma'),'utf8');
let source=original;
for(const name of ['StockReceipt','BranchStockBalance','StockMovement'])if(!new RegExp('^model '+name+'\\s*\\{','m').test(source))throw Error('Install and test the receiving ledger first; schema unchanged.');
const names=[...extra.matchAll(/^(?:model|enum) (\w+)\s*\{/gm)].map(m=>m[1]),present=names.filter(name=>new RegExp('^(?:model|enum) '+name+'\\s*\\{','m').test(source));
if(present.length&&present.length!==names.length)throw Error('Partial count schema found. No files changed.');
const additions={Branch:['stockCounts StockCount[]'],Product:['stockCountLines StockCountLine[]'],User:['stockCountsCreated StockCount[] @relation("StockCountCreator")','stockCountsApproved StockCount[] @relation("StockCountApprover")','stockCountEvents StockCountEvent[] @relation("StockCountActor")'],BranchStockBalance:['revision Int @default(0)'],StockMovement:['countId String?','stockCount StockCount? @relation(fields: [countId], references: [id], onDelete: Restrict)','@@index([countId])']};
for(const[name,fields]of Object.entries(additions)){const re=new RegExp('(^model '+name+'\\s*\\{)([\\s\\S]*?)(^\\})','m');if(!re.test(source))throw Error('Missing '+name+'; no files changed.');source=source.replace(re,(_whole,opening,body,closing)=>{const missing=[];for(const field of fields){if(field.startsWith('@@')){if(!body.includes(field))missing.push('  '+field);continue;}const key=field.split(' ')[0],line=body.split(/\r?\n/).find(value=>new RegExp('^\\s*'+key+'\\s').test(value));if(line){if(line.trim().replace(/\s+/g,' ')!==field)throw Error('Conflicting '+name+'.'+key+'; no files changed.');}else missing.push('  '+field);}return opening+body+(missing.length?'\n'+missing.join('\n')+'\n':'')+closing;});}
const movement=/^enum StockMovementKind\s*\{([\s\S]*?)^\}/m;if(!movement.test(source))throw Error('Missing movement enum; schema unchanged.');source=source.replace(movement,(_whole,body)=>'enum StockMovementKind {'+body+['OPENING_BALANCE','COUNT_ADJUSTMENT'].filter(value=>!new RegExp('^\\s*'+value+'\\s*$','m').test(body)).map(value=>'  '+value+'\n').join('')+'}');
if(!present.length)source+='\n\n'+extra+'\n';
if(source===original){console.log('Stock count schema already installed.');process.exit(0);}
if(process.argv.includes('--check')){console.log('Count schema can be installed; no file changed.');process.exit(0);}
const backup=file+'.before-stock-counts.bak';if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
fs.writeFileSync(file,source);console.log('Count models and balance revisions added; existing schema preserved.');
