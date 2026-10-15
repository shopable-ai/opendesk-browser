// Serve the 4 original Git-tracked preview/*.js bytes, never generated copies.
// Preview-only: production USER_SCRIPT admission and third-party licenses are separate.
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT_DIR=fileURLToPath(new URL('../',import.meta.url));
export const PREVIEW_ASSETS_DIR=join(PROJECT_DIR,'preview');
const SOURCE_COMMIT='b76abf4b95e34c1234a33927051ea13165d92715';
const RESOURCE_PREFIX='/';
const ORDER=['jszip.min.js','polyfill-45b9836beb.min.js',
  'xmind-sdk.bundle.js','snowbrush-2c2b5d62b5.js'];
export const PREVIEW_CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "+
  "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "+
  "base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none'";
const allowedFiles=new Map([
  ['/',join(PROJECT_DIR,'preview/index.html')],
  ['/index.html',join(PROJECT_DIR,'preview/index.html')],
  ['/chatgpt.html',join(PROJECT_DIR,'preview/chatgpt.html')],
  ['/preview/chatgpt.css',join(PROJECT_DIR,'preview/chatgpt.css')],
  ['/preview/chatgpt.js',join(PROJECT_DIR,'preview/chatgpt.js')],
  ['/preview/preview.css',join(PROJECT_DIR,'preview/preview.css')],
  ['/preview/app.js',join(PROJECT_DIR,'preview/app.js')],
  ['/assets/ui.css',join(PROJECT_DIR,'assets/ui.css')],
  ...['answer-registry','chatgpt-adapter','extract','view','xmind-adapter','xmind-convert']
    .map(name=>['/src/'+name+'.js',join(PROJECT_DIR,'src',name+'.js')])
]);
const mime=path=>path.endsWith('.html')?'text/html; charset=utf-8':
  path.endsWith('.css')?'text/css; charset=utf-8':
  path.endsWith('.js')?'text/javascript; charset=utf-8':'application/octet-stream';
const hash=(kind,bytes)=>createHash(kind).update(bytes).digest('hex');
const blobHash=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

export async function verifyFixedXmindAssets(directory=PREVIEW_ASSETS_DIR){
  if(typeof directory!=='string'||!directory.trim())throw new Error('E_XMIND_ASSETS_REQUIRED');
  const manifest=JSON.parse(await readFile(join(PROJECT_DIR,'tests/xmind-provenance.json'),'utf8'));
  if(manifest.commit!==SOURCE_COMMIT||
     manifest.assets.map(row=>row.name).join('|')!==ORDER.join('|'))
    throw new Error('E_XMIND_PROVENANCE_STALE');
  const root=await realpath(resolve(directory));
  const resources=new Map();
  for(const row of manifest.assets){
    if(!/^[a-z0-9.-]+\.js$/.test(row.name)||!Number.isSafeInteger(row.bytes)||row.bytes<=0||
       !/^[a-f0-9]{64}$/.test(row.sha256)||!/^[a-f0-9]{40}$/.test(row.gitBlob))
      throw new Error('E_XMIND_MANIFEST_INVALID:'+row.name);
    const file=await realpath(join(root,row.name));
    if(dirname(file)!==root)throw new Error('E_XMIND_ASSET_ESCAPE:'+row.name);
    const bytes=await readFile(file);
    if(bytes.length!==row.bytes||hash('sha256',bytes)!==row.sha256||
       blobHash(bytes)!==row.gitBlob)
      throw new Error('E_XMIND_ASSET_HASH:'+row.name);
    resources.set(RESOURCE_PREFIX+row.name,bytes);
  }
  return resources;
}
export async function startXmindPreview({assetsDirectory}={}){
  // No listening socket exists until every original resource has passed admission.
  const directory=assetsDirectory??PREVIEW_ASSETS_DIR;
  const resources=await verifyFixedXmindAssets(directory);
  const server=createServer(async(request,response)=>{
    try{
      if(!['GET','HEAD'].includes(request.method)){
        response.writeHead(405,{'Allow':'GET, HEAD'});response.end();return;
      }
      const pathname=new URL(request.url,'http://localhost').pathname;
      const file=allowedFiles.get(pathname);
      const asset=resources.get(pathname);
      if(!file&&!asset){response.writeHead(404);response.end();return;}
      const bytes=asset||await readFile(file);
      response.writeHead(200,{'Content-Type':mime(pathname),
        'Content-Security-Policy':PREVIEW_CSP,
        'X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
        'Referrer-Policy':'no-referrer'});
      response.end(request.method==='HEAD'?undefined:bytes);
    }catch{
      response.writeHead(404);response.end();
    }
  });
  await new Promise((ok,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',ok);
  });
  return {url:'http://127.0.0.1:'+server.address().port+'/index.html',
    close:()=>new Promise((ok,reject)=>server.close(error=>error?reject(error):ok()))};
}
// Open only our own verified loopback URL; never shell out with untrusted input.
// In headless/CI environments the printed URL remains the supported fallback.
function openLocalPreview(url){
  if(process.env.CI||process.env.OPENDESK_PREVIEW_NO_OPEN)return;
  if(process.platform==='linux'&&!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY)return;
  const platform=process.platform;
  const command=platform==='darwin'?'open':platform==='win32'?'cmd':'xdg-open';
  const args=platform==='win32'?['/c','start','',url]:[url];
  const child=spawn(command,args,{stdio:'ignore',detached:true,windowsHide:true});
  child.once('error',error=>console.warn('PREVIEW_BROWSER_OPEN_UNAVAILABLE: '+error.message+
    '; open the REAL_XMIND_LOCAL_PREVIEW URL manually.'));
  child.unref();
}
async function cli(){
  const args=process.argv.slice(2);
  if(args.length>1||(args.length===1&&args[0]!=='--no-open'))
    throw new Error('Usage: node examples/programs/chatgpt-mindmap/preview/serve.mjs [--no-open]');
  const autoOpen=args.length===0;
  const session=await startXmindPreview();
  const interactive=new URL(session.url);
  interactive.searchParams.set('autostart','1');
  console.log('PREVIEW_ASSETS_READY 4 original XMind JS directly in preview/ (SHA-256/Git Blob/size verified)');
  console.log('REAL_XMIND_LOCAL_PREVIEW '+interactive.href);
  const chatgptUrl=new URL('/chatgpt.html',session.url).href;
  console.log('REAL_XMIND_CHATGPT_PREVIEW '+chatgptUrl);
  console.log('Only loopback, exact four SHA-256 + Git blob verified resources; NOT an installed extension.');
  if(autoOpen)openLocalPreview(chatgptUrl);
  const shutdown=()=>{session.close().then(()=>process.exit(0)).catch(()=>process.exit(1));};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  cli().catch(error=>{console.error(error.message);process.exitCode=1;});
}
