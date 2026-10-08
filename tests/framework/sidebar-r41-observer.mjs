// Observation only. Product actions are entered through the native Chrome UI.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connect,evaluate} from './sidebar-native-session.mjs';

const directory=path.resolve(process.env.SIDEBAR_EVIDENCE_DIR);
const session=JSON.parse(await readFile(path.join(directory,'session.json'),'utf8'));
const label=process.argv[2] || 'ui';
if(!/^[a-zA-Z0-9_-]+$/.test(label))throw Error('Invalid observation label');
const client=await connect(session.endpoint);
try {
  const targets=(await client.send('Target.getTargets')).targetInfos;
  const pages=[];
  for(const target of targets.filter(target=>['page','other'].includes(target.type)&&!target.url.startsWith('chrome://'))) {
    const {sessionId}=await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    if(label==='arm'&&target.url.includes('/ui/tool.html'))await evaluate(client,`(()=>{
      if(globalThis.__r41Inputs)return;
      globalThis.__r41Inputs=[];
      for(const type of ['input','change','click'])document.addEventListener(type,event=>{
        const node=event.target;if(!node.id)return;
        globalThis.__r41Inputs.push({at:Date.now(),type,id:node.id,isTrusted:event.isTrusted,
          value:node.value,files:node.files?[...node.files].map(file=>({name:file.name,size:file.size})):undefined,
          sourceUtf8:document.querySelector('#script-source')?.value,params:document.querySelector('#script-params')?.value,
          taskParams:[...document.querySelectorAll('[data-task-param]')].map(node=>({name:node.dataset.taskParam,value:node.value}))});
      },true);
    })()`,sessionId);
    const state=await evaluate(client,`(()=>{
      const visible=node=>Boolean(node.getClientRects().length)&&getComputedStyle(node).visibility!=='hidden';
      return {url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth},
        surface:document.documentElement.dataset.opendeskSurface,tab:document.documentElement.dataset.opendeskTab,
        name:document.querySelector('#name')?.value,done:document.querySelector('#done')?.textContent,
        query:document.querySelector('#query')?.value,result:document.querySelector('#result')?.textContent,
        sourceUtf8:document.querySelector('#script-source')?.value,params:document.querySelector('#script-params')?.value,
        controls:[...document.querySelectorAll('[id]')].map(node=>({id:node.id,visible:visible(node),disabled:node.disabled,
          value:node.value,text:node.textContent,rect:(()=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()})),
        inputs:globalThis.__r41Inputs,resources:globalThis.OpenDeskResourceDiagnostics?.snapshot()};
    })()`,sessionId);
    pages.push({target,state});
  }
  const output=path.join(directory,label+'-ui.json');
  await writeFile(output,JSON.stringify({at:new Date().toISOString(),session,pages},null,2)+'\n');
  console.log(JSON.stringify({output,pages:pages.map(({target,state})=>({type:target.type,url:state.url,viewport:state.viewport,surface:state.surface,tab:state.tab,done:state.done}))}));
}finally{client.close();}
