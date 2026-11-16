import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
const file=path.resolve('.env.local');
if(!existsSync(file)){
 writeFileSync(file,'PROCUREMENT_LOCAL_PREVIEW=1\nPROCUREMENT_ACCESS_PASSWORD='+randomBytes(32).toString('hex')+'\n',{mode:0o600});
}
if(!readFileSync(file,'utf8').includes('PROCUREMENT_LOCAL_PREVIEW=1'))throw new Error('Questo comando richiede una configurazione dedicata all’anteprima locale.');
console.log('Anteprima: http://127.0.0.1:5180/commesse');
console.log('Password riservata nel file locale .env.local (non stampata).');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','5180'],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
