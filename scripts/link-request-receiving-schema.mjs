import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'prisma/schema.prisma'),original=fs.readFileSync(file,'utf8');
let source=original;
const additions={StockReceipt:[
 'sourceRequestId String? @unique',
 'sourceRequest DailyRequest? @relation("RequestStockReceipt", fields: [sourceRequestId], references: [id], onDelete: Restrict)',
],DailyRequest:['stockReceipt StockReceipt? @relation("RequestStockReceipt")']};
for(const [name,fields]of Object.entries(additions)){
 const re=new RegExp('(^model '+name+'\\s*\\{)([\\s\\S]*?)(^\\})','m');
 if(!re.test(source))throw Error('Missing '+name+' model. Install manual receiving first; no files changed.');
 source=source.replace(re,(_whole,opening,body,closing)=>{
  const missing=[];
  for(const field of fields){const key=field.split(' ')[0],line=body.split(/\r?\n/).find(value=>new RegExp('^\\s*'+key+'\\s').test(value));if(line){if(line.trim().replace(/\s+/g,' ')!==field)throw Error('Conflicting '+name+'.'+key+'; no files changed.');}else missing.push('  '+field);}
  return opening+body+(missing.length?'\n'+missing.join('\n')+'\n':'')+closing;
 });
}
if(source===original){console.log('Request receiving schema already linked.');process.exit(0);}
if(process.argv.includes('--check')){console.log('Request receiving schema can be linked; no files changed.');process.exit(0);}
const backup=file+'.before-request-receiving.bak';if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
fs.writeFileSync(file,source);console.log('Added request receipt relation; existing schema preserved.');
