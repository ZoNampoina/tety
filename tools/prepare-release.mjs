import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir} from 'node:fs/promises';
const root=new URL('../dist/',import.meta.url);
async function walk(prefix=''){const names=[];for(const entry of await readdir(new URL(prefix,root),{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())names.push(...await walk(name+'/'));else if(name!=='sw.js')names.push(name);}return names;}
const names=(await walk()).sort(),hash=createHash('sha256');
for(const name of names)hash.update(name).update(await readFile(new URL(name,root)));
const version=hash.digest('hex').slice(0,12),file=new URL('sw.js',root);
const files=['./',...names.map(x=>'./'+x)];
let source=await readFile(file,'utf8');source=source.replace(/tety-shell-(?:v1|[0-9a-f]{12})/g,'tety-shell-'+version).replace(/const FILES=\[[^;]*\];/,'const FILES='+JSON.stringify(files)+';');
await writeFile(file,source);
console.log(`Version de cache : ${version} · ${files.length} ressources locales`);
