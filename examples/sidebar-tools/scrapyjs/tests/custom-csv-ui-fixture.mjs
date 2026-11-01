// Source-bound offline component fixture. Writes only a fresh OS temporary directory;
// no listener, shared dist, preview triplet, tool package or installed environment.
import {build} from 'esbuild';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadPreviewRuntime} from '../preview/runtime.mjs';
import {compileSharedToolCss,officialDesignSources} from '../../../../scripts/preview/shared-tool-design.mjs';
import {sidebarPreviewShellSource} from '../../../../scripts/preview/sidebar-shell-source.mjs';
import {PAGE_FRAMEWORK_IMPORTS} from '../../../../src/libs/page-frameworks/contract.js';

const tool=fileURLToPath(new URL('../',import.meta.url)),repo=resolve(tool,'../../..');
const inputs={},hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function record(path){const bytes=await readFile(path);inputs[path]={bytes:bytes.length,sha256:hash(bytes)};return bytes;}
const runtime=await loadPreviewRuntime({record});
const named={...PAGE_FRAMEWORK_IMPORTS.react,'react-dom/client':['createRoot','hydrateRoot'],
  '@opendesk/ui':['Button','IconButton','Card','CardContent','Switch','Input','Textarea','SharedConversationFrame','SharedConversationDock','createConversationSession']};
const app=await build({entryPoints:[join(tool,'preview/dev.jsx')],bundle:true,write:false,metafile:true,
  outfile:'csv-ui-test.js',format:'esm',jsx:'automatic',target:'es2022',logLevel:'silent',
  define:{'process.env.NODE_ENV':'"production"','import.meta.hot':'false'},plugins:[{name:'csv-test-public-runtime',setup(builder){
    builder.onResolve({filter:/^(?:react(?:\/jsx-runtime)?|react-dom\/client|@opendesk\/ui)$/},({path})=>({path,namespace:'csv-runtime'}));
    builder.onLoad({filter:/.*/,namespace:'csv-runtime'},({path})=>({contents:'const value=globalThis.'+(path==='@opendesk/ui'?'OpenDeskSidebarUI':'OpenDeskPageReact')+';export default value;export const {'+named[path].join(',')+'}=value;'}));
    builder.onLoad({filter:/\/src\/style\.css$/},async({path})=>({contents:await compileSharedToolCss('/* @opendesk-shared-design */\n')+'\n'+await record(path),loader:'css',resolveDir:resolve(path,'..')}));
  }}]});
for(const name of Object.keys(app.metafile.inputs).filter(name=>!name.startsWith('csv-runtime:')))await record(resolve(name));
const shell=await sidebarPreviewShellSource({tool:'scrapyjs'}),design=await officialDesignSources();
const original=(await record(join(tool,'preview/dev.html'))).toString();
const outerSource=original.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replaceAll('/preview/dev-frame.html','./frame.html');
const outer=await build({stdin:{contents:outerSource,resolveDir:join(tool,'preview'),loader:'js'},bundle:true,write:false,format:'iife',target:'es2022'});
const checks=await build({stdin:{contents:"export {exerciseResultDisplay} from './result-display-interactions.mjs';export {exerciseFieldOrder} from './field-order-interactions.mjs';",resolveDir:join(tool,'tests'),loader:'js'},bundle:true,write:false,format:'iife',globalName:'CsvChecks',target:'es2022'});
const script=code=>'<script>'+String(code).replaceAll('</script','<\\/script')+'</script>';
const css=app.outputFiles.find(row=>row.path.endsWith('.css')).text;
const frame='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><style>'+css+'</style><div id="tool-root"><div id="tool-app"></div></div>'+script(runtime.react)+script(runtime.shared)+'<script type="module">'+app.outputFiles.find(row=>row.path.endsWith('.js')).text.replaceAll('</script','<\\/script')+'</script></html>';
const html=original.replace('<!-- CANONICAL_SHELL_CSS -->','<style>'+design.tokens+'\n'+design.components+'\n'+shell.css+'\n'+await readFile(join(repo,'src/ui/react/components/conversation-layout.css'),'utf8')+'</style>')
  .replace('<!-- CANONICAL_SHELL_HEADER -->',shell.nav+shell.head).replace('src="/preview/dev-frame.html"','src="./frame.html"')
  .replace(/<script type="module">[\s\S]*?<\/script>/,()=>script(outer.outputFiles[0].text));
for(const [path,expected] of Object.entries(inputs))if(hash(await readFile(path))!==expected.sha256)throw Error('Related source changed during fixture compilation: '+path);
const out=await mkdtemp(join(tmpdir(),'scrapyjs-custom-csv-ui-'));
await writeFile(join(out,'frame.html'),frame);
await writeFile(join(out,'index.html'),html);
await writeFile(join(out,'checks.js'),checks.outputFiles[0].text);
await writeFile(join(out,'source-inputs.json'),JSON.stringify({kind:'SOURCE_COMPONENT_TEST_ONLY',inputs},null,2));
console.log(JSON.stringify({out,url:pathToFileURL(join(out,'index.html')).href,checks:join(out,'checks.js')}));
