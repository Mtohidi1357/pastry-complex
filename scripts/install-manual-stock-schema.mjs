import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(scriptDirectory,'..'),file=path.join(root,'prisma/schema.prisma');
let source=fs.readFileSync(file,'utf8');
const original=source,extra=fs.readFileSync(path.join(root,'schema/manual-stock.prisma'),'utf8');
const declarations=[...extra.matchAll(/^(?:model|enum) (\w+)\s*\{/gm)].map(m=>m[1]);
const present=declarations.filter(name=>new RegExp('^(?:model|enum) '+name+'\\s*\\{','m').test(source));
if(present.length&&present.length!==declarations.length)throw Error('Partial stock schema found. Stop and review; no files were written.');
const additions={
 Branch:['stockReceipts StockReceipt[]','stockBalances BranchStockBalance[]','stockMovements StockMovement[]'],
 Product:['stockReceiptLines StockReceiptLine[]','stockBalances BranchStockBalance[]','stockMovements StockMovement[]'],
 User:['stockReceiptsCreated StockReceipt[] @relation("StockReceiptCreator")','stockReceiptsConfirmed StockReceipt[] @relation("StockReceiptConfirmer")','stockReceiptsReversed StockReceipt[] @relation("StockReceiptReverser")','stockMovements StockMovement[] @relation("StockMovementActor")'],
};
for(const [model,fields]of Object.entries(additions)){
 const re=new RegExp('(^model '+model+'\\s*\\{)([\\s\\S]*?)(^\\})','m');
 if(!re.test(source))throw Error('Missing '+model+' model; no files were written.');
 source=source.replace(re,(whole,opening,body,closing)=>{const missing=[];for(const field of fields){const name=field.split(' ')[0],line=body.split(/\r?\n/).find(x=>new RegExp('^\\s*'+name+'\\s').test(x));if(line){if(line.trim().replace(/\s+/g,' ')!==field)throw Error('Conflicting '+model+'.'+name+'; no files were written.');}else missing.push('  '+field);}return opening+body+(missing.length?'\n'+missing.join('\n')+'\n':'')+closing;});
}
if(!present.length)source+='\n\n'+extra+'\n';
if(source===original){console.log('Manual stock schema already installed.');process.exit(0);}
if(process.argv.includes('--check')){console.log('Schema can be extended; no file changed.');process.exit(0);}
const backup=file+'.before-manual-stock.bak';if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
fs.writeFileSync(file,source);console.log('Extended current schema; existing models and lease fields preserved. Backup: '+backup);
