// Development-only source preview. Uses the original packer, ToolHost and Bridge; writes no dist or installation.
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../../../scripts/build-sidebar-tool.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../../..');
const tool=await createSidebarToolPackage(resolve(here,'..'));
const raw={name:'existing-raw-inputs',setup(b){
  b.onResolve({filter:/\?(raw|inline)$/},args=>({path:resolve(args.resolveDir,args.path.replace(/\?(raw|inline)$/,'')),namespace:'raw'}));
  b.onLoad({filter:/.*/,namespace:'raw'},async({path})=>({contents:'export default '+JSON.stringify(await readFile(path,'utf8')),loader:'js'}));
}};
const options={absWorkingDir:repo,bundle:true,write:false,minify:true,format:'esm',platform:'browser',target:'es2022',jsx:'transform',
  alias:{'@opendesk/ui':resolve(repo,'src/ui/react/components/ui/button.tsx')},
  define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent',plugins:[raw]};
const host=await build({...options,entryPoints:[resolve(here,'entry.tsx')],outfile:resolve(here,'app.js')});
const bridge=await build({...options,format:'iife',stdin:{resolveDir:repo,contents:"import {initSidebarToolSandbox} from './src/sidebar-tools/bridge.js';initSidebarToolSandbox();",loader:'js'}});
const css=(await Promise.all(['design-tokens.css','design-system.css','extension-center.css','tool-shell.css'].map(name=>readFile(resolve(repo,'src/ui',name),'utf8')))).join('\n')+
  host.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n');
const files=new Map([
  ['/',{type:'text/html',body:await readFile(resolve(here,'index.html'))}],
  ['/app.js',{type:'text/javascript',body:host.outputFiles.find(file=>file.path.endsWith('.js')).contents}],
  ['/bridge.js',{type:'text/javascript',body:bridge.outputFiles[0].contents}],
  ['/style.css',{type:'text/css',body:css}],
  ['/tool.json',{type:'application/json',body:encodeSidebarToolPackage(tool)}],
  ['/sandbox.html',{type:'text/html',body:await readFile(resolve(repo,'src/sidebar-tools/sandbox.html'))}]
]);
const server=createServer((req,res)=>{
  const file=files.get(new URL(req.url,'http://127.0.0.1').pathname);
  if(req.method!=='GET'||!file){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':file.type+'; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'});
  res.end(file.body);
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port+'/',pid:process.pid,mode:'SOURCE_FIXTURE_ONLY',toolId:tool.id}));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
