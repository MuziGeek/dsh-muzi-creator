/** Check current plugin sources for unclassified upstream names. */
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join,relative,extname} from 'node:path';
const root=resolve(process.argv[2]??process.cwd());
const oldDataFiles=new Set(['src/config.ts','src/catalog.ts','tests/config.test.ts','tests/dataDirectory.test.ts','tests/catalog.test.ts','tests/previewServers.test.ts','tests/collectSpaces.test.ts','docs/mz-naming.md']);
const iconProvenanceFiles=new Set(['src/client/assets/workbench-icons/manifest.json','docs/iconography.md']);
const attributionFiles=new Set(['README.md','package.json']);
const interfaceHistoryFiles=new Set(['docs/mz-naming.md','tests/mzNaming.test.ts']);
const exceptions=[/\boil-(?:subtitle|cover|tone|video-article)(?![\w-])/g,/\bOIL_(?:SUBTITLE|COVER)_SKILL\b/g,/\bgenerate_oil_cover\.py\b/g,/https:\/\/github\.com\/oil-oil\/[\w.-]+/g,/@oil-oil\/dsh-vision\b/g];
const ignored=new Set(['scripts/check-mz-names.mjs','tests/mzNamingGuard.test.ts']);
async function files(dir){const rows=await readdir(dir,{withFileTypes:true}).catch(()=>[]);return (await Promise.all(rows.map(row=>row.isDirectory()?files(join(dir,row.name)):Promise.resolve([join(dir,row.name)])))).flat();}
const candidates=[...(await Promise.all(['src','tests','scripts','docs'].map(dir=>files(join(root,dir))))).flat(),...['README.md','PRODUCT.md','DESIGN.md','package.json','tsdown.config.ts'].map(file=>join(root,file))];
const failures=[];
for(const file of candidates){
 const name=relative(root,file).replaceAll('\\','/');if(ignored.has(name)||!['.ts','.tsx','.mjs','.md','.css','.json'].includes(extname(file)))continue;
 let text=await readFile(file,'utf8').catch(()=> '');
 if(oldDataFiles.has(name))text=text.replaceAll('.dsh-oil-creator','LEGACY_DATA');
 if(['src/collectSpaces.ts','scripts/collect-publish.mjs','tests/collectSpaces.test.ts'].includes(name))text=text.replaceAll('oil-collect-publish','HISTORICAL_SPACE');
 if(name==='tests/collectSpaces.test.ts')text=text.replaceAll('oil-collect-history','HISTORICAL_RECORD');
 if(iconProvenanceFiles.has(name))text=text.replace(/\boil-icon\b/g,'ICON_GENERATOR');
 if(attributionFiles.has(name))text=text.replaceAll('Oil Creator','UPSTREAM');
 if(interfaceHistoryFiles.has(name))text=text.replace(/oil_\*|oil_[a-z_]+|oilCreator|OIL_COLLECT_\*/g,'PREVIOUS_INTERFACE');
 for(const pattern of exceptions)text=text.replace(pattern,'UPSTREAM');
 for(const [i,line] of text.split('\n').entries())if(/oil/i.test(line))failures.push(`${name}:${i+1}: ${line.trim()}`);
 if(/oil/i.test(name))failures.push(`${name}: filename retains previous plugin name`);
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('MZ naming check passed: only documented upstream and legacy-data exceptions remain.');
