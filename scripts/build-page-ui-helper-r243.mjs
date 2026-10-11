// Pinned offline conversion of the existing USER_SCRIPT @opendesk/ui helper.
// Output is inert code for the original Page USER_SCRIPT execution unit.
// This is NOT a second SDK or execution engine; source code never runs here.
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
const root=resolve('.'),out=resolve('artifacts/r243-page-ui-helper');
const source=resolve('src/scripting/user-scripts/page-ui.js');
const require=createRequire(import.meta.url);
const esbuild=require('esbuild/package.json');
if(esbuild.version!=='0.28.2')throw Error('E_PAGE_HELPER_TOOLCHAIN_IDENTITY');
const helpers=[
  'src/scripting/user-scripts/page-ui.js',
  'src/scripting/user-scripts/page-ui-mount.js',
  'src/scripting/user-scripts/page-program-rules.js'
];
const inputs=[];
for(const file of helpers){
 const bytes=await readFile(file);
 inputs.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const bundle=await build({
 entryPoints:[source],bundle:true,write:false,platform:'browser',format:'iife',
 globalName:'__opendeskPageUIR243',target:'es2022',minify:true,
 sourcemap:false,legalComments:'none',treeShaking:true,logLevel:'silent'
});
if(bundle.outputFiles.length!==1||bundle.outputFiles[0].path.endsWith('.map'))throw Error('E_PAGE_HELPER_OUTPUT');
const bytes=Buffer.from(bundle.outputFiles[0].contents),code=bytes.toString('utf8');
if(bytes.length<1000||bytes.length>49152||!code.includes('__opendeskPageUIR243')||
  /\b(?:eval|Function|AsyncFunction|importScripts)\s*\(/.test(code))throw Error('E_PAGE_HELPER_SOURCE');
parse(code,{ecmaVersion:'latest',sourceType:'script'});
await mkdir(out,{recursive:true});
await writeFile(join(out,'page-ui-helper.js'),bytes);
const sha256=createHash('sha256').update(bytes).digest('hex');
console.log('R243_PAGE_UI_HELPER_META '+JSON.stringify({
  version:'opendesk.page-ui-helper.r243',compiler:'esbuild@0.28.2',
  bytes:bytes.length,sha256,sourceInputs:inputs,readyForReview:true,
  publishedToExtension:false
}));
if(process.argv.includes('--emit-base64')){
 const b64=bytes.toString('base64');console.log('R243_PAGE_UI_HELPER_START');
 for(let n=0;n<b64.length;n+=4096)console.log('R243_PAGE_UI_HELPER_PART '+b64.slice(n,n+4096));
 console.log('R243_PAGE_UI_HELPER_END');
}
