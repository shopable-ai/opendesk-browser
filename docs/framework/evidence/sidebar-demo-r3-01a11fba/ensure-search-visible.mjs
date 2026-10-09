// Observe first, then use native wheel only when the actual search controls need it.
import {readFile,writeFile} from 'node:fs/promises';import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,targetId,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),c=await connect(s.endpoint),observations=[];
try{const {sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true});let observed;
 for(let attempt=0;attempt<5;attempt++){
  observed=await evaluate(c,"(() => {const e=document.querySelector('#keyword'),b=document.querySelector('#search-submit'),r=e.getBoundingClientRect(),br=b.getBoundingClientRect();return {url:location.href,scrollY,keywordY:r.y,keywordHit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e,buttonHit:b.contains(document.elementFromPoint(br.x+br.width/2,br.y+br.height/2)),value:e.value,disabled:b.disabled,count:document.querySelector('#search-count').textContent};})()",sessionId);observations.push(observed);
  if(observed.keywordHit&&observed.buttonHit)break;
  await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:400,y:400,deltaX:0,deltaY:observed.keywordY-200},sessionId);await new Promise(r=>setTimeout(r,350));
 }
 await writeFile(out,JSON.stringify({at:new Date().toISOString(),targetId,method:'Readonly geometry and trusted native wheel',observations},null,2)+'\n',{flag:'wx'});
 if(!observed.keywordHit||!observed.buttonHit)throw Error('Real search controls remain outside view');console.log(JSON.stringify(observed));
}finally{c.close();}
