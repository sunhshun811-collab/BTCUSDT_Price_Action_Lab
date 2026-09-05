import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const files=readdirSync(new URL('../tests/',import.meta.url)).filter(x=>x.endsWith('_smoke.mjs')).sort();
for(const file of files){
  const result=spawnSync(process.execPath,[`tests/${file}`],{stdio:'inherit',cwd:new URL('../',import.meta.url)});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
console.log(`全部 ${files.length} 项 smoke tests 通过。`);
