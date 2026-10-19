// Stages a separate candidate with the ONLY official packer. NEVER mutates
// cookie-editor/tool.config.json or the installed v2.0.23 package.
import {readFile,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {buildSidebarTool} from '../../../../scripts/build-sidebar-tool.mjs';
import {COOKIE_REACT_SOURCE_FILES} from '../vite.config.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(root,'../../..');
const stage=join(repo,'artifacts/sidebar-tools/cookie-editor/r56-react-project');
const candidate=join(repo,'artifacts/sidebar-tools/cookie-editor/r56-react-2.0.27-candidate.opendesk-tool.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=JSON.parse(await readFile(join(root,'tool.config.json'),'utf8'));
if(original.id!=='cookie-editor'||original.version!=='2.0.23'||
  original.files?.js!=='src/main.js')
  throw Error('Official Cookie Editor baseline changed: review the new version before preparing a candidate');
const official=JSON.parse(await readFile(join(root,'cookie-editor.opendesk-tool.json'),'utf8'));
if(official.id!=='cookie-editor'||official.version!=='2.0.23')
  throw Error('Official Cookie installation package baseline differs; do not replace it');
const ready=JSON.parse(await readFile(join(root,'dist/build-ready.json'),'utf8'));
if(ready.format!=='opendesk.ui-build-ready.v1')throw Error('Build receipt is absent');
if(Object.keys(ready.sources||{}).sort().join(',')!==[...COOKIE_REACT_SOURCE_FILES].sort().join(','))
  throw Error('React source-bound build receipt is absent');
for(const name of COOKIE_REACT_SOURCE_FILES){
  const bytes=await readFile(join(root,name)),expected=ready.sources[name];
  if(expected?.sha256!==hash(bytes)||expected.bytes!==bytes.length)
    throw Error('React source changed since compilation: '+name);
}
for(const name of ['tool.js','tool.css']){
  const bytes=await readFile(join(root,'dist',name));
  if(ready.files?.['dist/'+name]?.sha256!==hash(bytes)||
    ready.files['dist/'+name].bytes!==bytes.length)
    throw Error('React release bytes no longer match their receipt');
}
const config={...original,version:'2.0.27',uiRuntime:'opendesk.react-ui.v1',
  files:{html:'src/root.html',css:'dist/tool.css',js:'dist/tool.js'},assets:[]};
await rm(stage,{recursive:true,force:true});
await mkdir(join(stage,'src'),{recursive:true});
await mkdir(join(stage,'dist'),{recursive:true});
await writeFile(join(stage,'tool.config.json'),JSON.stringify(config,null,2)+'\n');
for(const [source,dest] of [
  ['src/root.html','src/root.html'],
  ['dist/tool.js','dist/tool.js'],['dist/tool.css','dist/tool.css'],
  ['dist/build-ready.json','dist/build-ready.json'],
  ...COOKIE_REACT_SOURCE_FILES.map(name=>[name,name])
]){
  await mkdir(dirname(join(stage,dest)),{recursive:true});
  await copyFile(join(root,source),join(stage,dest));
}
const output=await buildSidebarTool(stage,{out:candidate});
const bytes=await readFile(candidate);
process.stdout.write(JSON.stringify({...output,sha256:hash(bytes),format:'cookie-editor.react-candidate.v1',
  officialVersionUnchanged:original.version},null,2)+'\n');
