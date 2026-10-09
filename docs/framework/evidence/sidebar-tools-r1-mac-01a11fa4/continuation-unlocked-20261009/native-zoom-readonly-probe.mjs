import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connect,evaluate} from '/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/opendesk-sidebar-final-main-01a11fa4-_12si0z7/tests/framework/sidebar-native-session.mjs';
const directory=path.resolve(process.env.TOOL_EVIDENCE_DIR);
const label=process.argv[2];
if(!/^[a-zA-Z0-9_-]+$/.test(label||''))throw Error('Unique observation label required');
const session=JSON.parse(await readFile(path.join(directory,'session.json'),'utf8'));
const client=await connect(session.endpoint);
try{
  const targets=(await client.send('Target.getTargets')).targetInfos;
  const states=[];
  for(const target of targets.filter(t=>['page','iframe'].includes(t.type))){
    const id=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    const state=await evaluate(client,`(()=>({url:location.href,title:document.title,visibility:document.visibilityState,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,devicePixelRatio,scale:visualViewport.scale,bodyFont:getComputedStyle(document.body).fontSize,active:{tag:document.activeElement.tagName,id:document.activeElement.id,role:document.activeElement.getAttribute('role')},controls:[...document.querySelectorAll('button,input,textarea,[role="tab"]')].filter(n=>n.getClientRects().length).map(n=>({tag:n.tagName,id:n.id,text:n.textContent?.slice(0,80),value:n.value,disabled:n.disabled,font:getComputedStyle(n).fontSize,rect:{x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}})),apis:{runtime:typeof globalThis.chrome?.runtime,tabs:typeof globalThis.chrome?.tabs,storage:typeof globalThis.chrome?.storage}}))()`,id);
    states.push({target,state});
    if(target.type==='page'&&(target.url.includes('/ui/tool.html')||target.url.startsWith('chrome://settings/appearance'))){
      const shot=await client.send('Page.captureScreenshot',{format:'png'},id);
      await writeFile(path.join(directory,label+'-'+target.targetId+'.png'),Buffer.from(shot.data,'base64'));
    }
  }
  const data={at:new Date().toISOString(),status:'OBSERVED',session,states,method:'Readonly actual CDP viewport/font/focus and screenshot; no DOM styling, zoom emulation or permission mutation'};
  await writeFile(path.join(directory,label+'.json'),JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({label,states:states.map(x=>({type:x.target.type,...Object.fromEntries(['url','visibility','width','scrollWidth','devicePixelRatio','scale','bodyFont'].map(k=>[k,x.state[k]]))}))}));
}finally{client.close();}
