import {readFile,writeFile,readdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Bundle PDF font/CMap resources so reading never depends on a CDN.
for(const name of ['cmaps','standard_fonts']) await cp(`node_modules/pdfjs-dist/${name}`,`dist/${name}`,{recursive:true});
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();}
const paths=(await walk('dist')).filter(p=>!p.endsWith('/sw.js')).sort();
const digest=createHash('sha256');for(const p of paths)digest.update(await readFile(p));
const version=digest.digest('hex').slice(0,14);
const urls=paths.map(p=>'./'+p.slice(5));
const template=await readFile('scripts/sw-template.js','utf8');
await writeFile('dist/sw.js',template.replace('__VERSION__',version).replace('__PRECACHE__',JSON.stringify(urls)));
console.log(`Offline bundle: ${paths.length} resources, version ${version}`);
