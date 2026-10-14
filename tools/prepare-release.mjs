import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../dist/',import.meta.url);
const hash=createHash('sha256');
for(const name of ['app.mjs','storage.mjs','geo.mjs','style.css','permits.json','index.html'])hash.update(await readFile(new URL(name,root)));
const version=hash.digest('hex').slice(0,12),file=new URL('sw.js',root);
await writeFile(file,(await readFile(file,'utf8')).replace(/tety-shell-(?:v1|[0-9a-f]{12})/g,'tety-shell-'+version));
console.log('Version de cache : '+version);
