// Pause a real Sidebar call, observe it unchanged, then resume after native navigation.
// No dispatch, return replacement, permission bypass or synthetic receipt.
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {createInterface} from 'node:readline';
const [sessionPath,mode,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),source=await readFile(s.extension+'/sw.js','utf8');
if(!['before','after'].includes(mode))throw Error('Bounded before/after mode');
const start=source.indexOf('.runtime.onMessage.addListener'),m=/addListener\(\(\((\w+),(\w+),(\w+)\)=>(\w+)\?\.protocol/.exec(source.slice(start,start+250));
if(!m)throw Error('Real onMessage breakpoint not recognized');
const before=start+m.index+m[0].lastIndexOf(m[4]+'?.protocol'),marker=source.indexOf('Native user script returned no exact document receipt'),tail=source.slice(marker,marker+400),r=/const ([A-Za-z_$][\w$]*)=[A-Za-z_$][\w$]*\[0\];if\(/.exec(tail);
if(!r)throw Error('Real receipt point not recognized');const after=marker+r.index+r[0].length-3;
const ws=new WebSocket(s.endpoint),pending=new Map(),events=[];let seq=0,sid,holding=false,closed=false,bpBefore,bpAfter,timer;
await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
const send=(method,params={},id=sid)=>new Promise((ok,fail)=>{const n=++seq;pending.set(n,{ok,fail});ws.send(JSON.stringify({id:n,method,params,...id?{sessionId:id}:{}}));});
const save=()=>writeFile(out,JSON.stringify({at:new Date().toISOString(),mode,sessionPath,packageHash:s.package.packageHash,swSha256:createHash('sha256').update(source).digest('hex'),before,after,holding,closed,events},null,2)+'\n');
async function finish(reason){if(closed)return;closed=true;clearTimeout(timer);events.push({at:new Date().toISOString(),action:'resume',reason});if(holding)await send('Debugger.resume').catch(()=>{});holding=false;await send('Debugger.disable').catch(()=>{});await save();ws.close();process.exit(reason==='requested'?0:1);}
ws.onmessage=async({data})=>{const x=JSON.parse(data),p=pending.get(x.id);if(p){pending.delete(x.id);x.error?p.fail(Error(JSON.stringify(x.error))):p.ok(x.result);return;}if(x.method!=='Debugger.paused'||closed)return;
 try{const f=x.params.callFrames[0],isAfter=x.params.hitBreakpoints?.includes(bpAfter),expression=isAfter?r[1]:`({message:${m[1]},sender:${m[2]}})`,q=await send('Debugger.evaluateOnCallFrame',{callFrameId:f.callFrameId,expression,returnByValue:true,silent:true});
  const value=q.result.value,wanted=isAfter || value?.message?.type==='previewPageScript';
  if(wanted)events.push({at:new Date().toISOString(),kind:isAfter?'native-execute-reply':'real-sender',observed:value,location:f.location,exceptionDetails:q.exceptionDetails});
  holding=wanted&&(mode==='before'?!isAfter:isAfter);await save();
  if(holding){console.log(JSON.stringify({holding:true,mode,kind:isAfter?'native-execute-reply':'real-sender'}));timer=setTimeout(()=>finish('observer-timeout'),45000);}else await send('Debugger.resume');
 }catch(e){events.push({observerError:String(e)});await send('Debugger.resume').catch(()=>{});await save();}
};
const sw=(await send('Target.getTargets',{},null)).targetInfos.find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${s.extensionId}/sw.js`);if(!sw)throw Error('Actual extension SW missing');sid=(await send('Target.attachToTarget',{targetId:sw.targetId,flatten:true},null)).sessionId;await send('Debugger.enable');
bpBefore=(await send('Debugger.setBreakpointByUrl',{url:sw.url,lineNumber:0,columnNumber:before})).breakpointId;
if(mode==='after')bpAfter=(await send('Debugger.setBreakpointByUrl',{url:sw.url,lineNumber:0,columnNumber:after})).breakpointId;
await save();console.log(JSON.stringify({armed:true,mode}));
createInterface({input:process.stdin}).on('line',()=>finish('requested'));
process.on('SIGUSR1',()=>finish('requested'));

