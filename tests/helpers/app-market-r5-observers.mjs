// Readonly, source-bound native observations. No API replacement, fake sender,
// return-value override, installation write or product test hook is used here.
import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {exactBreakpointLocation,readFrame} from '../framework/b05-native-observers.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const isFunction=node=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node?.type);
export function marketSenderPoints(source){
  const entries=[];
  function walk(node,ancestors=[]){
    if(!node?.type)return;entries.push({node,ancestors});
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)walk(child,[...ancestors,node]);
      else if(value?.type)walk(value,[...ancestors,node]);
    }
  }
  walk(parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}));
  const markers=entries.filter(({node})=>node.type==='Literal'&&node.value==='E_EXTENSION_ID');
  assert.equal(markers.length,1,'one market envelope validator');
  const fn=markers[0].ancestors.filter(isFunction).at(-1);
  assert(fn?.id?.name,'named actual validator; do not guess minified bindings');
  assert(entries.some(({node,ancestors})=>node.type==='Literal'&&node.value==='E_SENDER'&&ancestors.filter(isFunction).at(-1)===fn));
  const calls=entries.filter(({node})=>node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name===fn.id.name);
  assert(calls.length>0&&calls.length<=4,'bounded exact validator calls');
  return calls.map(({node})=>{
    assert.equal(node.arguments.length,3);assert(node.arguments.every(arg=>arg.type==='Identifier'));
    return {range:[node.start,node.end],text:source.slice(node.start,node.end),
      location:{lineNumber:node.loc.start.line-1,columnNumber:node.loc.start.column},
      endLocation:{lineNumber:node.loc.end.line-1,columnNumber:node.loc.end.column},
      senderExpression:node.arguments[1].name,channelExpression:node.arguments[2].name};
  });
}
function projection(point){
  const s=point.senderExpression,c=point.channelExpression;
  const shape=(base,fields)=>'{'+fields.map(key=>JSON.stringify(key)+':{present:Object.hasOwn('+base+','+JSON.stringify(key)+'),type:typeof '+base+'?.'+key+',value:'+base+'?.'+key+'??null}').join(',')+'}';
  return '({senderKeys:Object.keys('+s+'),sender:'+shape(s,['id','nativeApplication','frameId','documentId','documentLifecycle','origin','url'])+
    ',tabPresent:Object.hasOwn('+s+',"tab"),tabType:typeof '+s+'.tab,tab:'+shape('('+s+'.tab||{})',['id','incognito','url'])+
    ',channel:'+shape(c,['enabled','mode','origin','extensionId','protocol'])+'})';
}
export async function observeMarketSender(d){
  const origin='chrome-extension://'+d.getExtensionId(),url=origin+'/marketplace/market-host.js';
  const target=await d.until(async()=>(await d.sendBrowser('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===origin+'/sw.js'),'market sender observer worker');
  const {sessionId}=await d.sendBrowser('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const client={send:(method,params={},timeout=20000)=>d.sendBrowser(method,params,timeout,sessionId)};
  const record=d.evidence.r5.senderObservation={status:'IN_PROGRESS',targetId:target.targetId,sessionId,url,observations:[],errors:[]};
  const scripts=[],contexts=[],pending=new Set(),points=new Map();let disposed=false;
  const off=d.onBrowserEvent(event=>{
    if(event.sessionId!==sessionId)return;
    if(event.method==='Debugger.scriptParsed')scripts.push(event.params);
    if(event.method==='Runtime.executionContextCreated')contexts.push(event.params.context);
    if(event.method!=='Debugger.paused')return;
    const point=event.params.hitBreakpoints?.map(id=>points.get(id)).find(Boolean);if(!point)return;
    const job=(async()=>{
      try{
        const frame=event.params.callFrames[0];
        assert.equal(frame.location.scriptId,record.script.scriptId);
        assert.equal(frame.location.lineNumber,point.location.lineNumber);assert.equal(frame.location.columnNumber,point.location.columnNumber);
        record.observations.push({at:new Date().toISOString(),location:frame.location,value:await readFrame(client,frame,projection(point))});
        record.status='OBSERVED';
      }catch(error){record.errors.push({stage:'read',message:error.message});record.status='NOT_OBSERVED';}
      finally{await client.send('Debugger.resume').catch(error=>record.errors.push({stage:'resume',message:error.message}));}
    })();pending.add(job);void job.finally(()=>pending.delete(job));
  });
  async function dispose(){
    if(disposed)return;disposed=true;await Promise.allSettled([...pending]);
    for(const breakpointId of points.keys())await client.send('Debugger.removeBreakpoint',{breakpointId}).catch(()=>{});
    await client.send('Debugger.disable').catch(()=>{});off();
    await d.sendBrowser('Target.detachFromTarget',{sessionId}).catch(()=>{});
  }
  d.t.after(dispose);
  try{
    await client.send('Runtime.enable');await client.send('Debugger.enable');
    const script=await d.until(()=>scripts.find(s=>s.url===url),'market-host actual loaded script');
    const actual=(await client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource;
    assert.equal(hash(actual),hash(await readFile(join(d.extension,'marketplace/market-host.js'),'utf8')),'loaded market host matches exact package');
    Object.assign(record,{sourceHash:hash(actual),script,executionContext:contexts.find(c=>c.id===script.executionContextId),points:[]});
    for(const point of marketSenderPoints(actual)){
      const locations=(await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId:script.scriptId,...point.location},end:{scriptId:script.scriptId,...point.endLocation},restrictToFunction:true})).locations;
      const location=exactBreakpointLocation(point,locations,script.scriptId);
      const installed=await client.send('Debugger.setBreakpoint',{location});
      for(const key of ['scriptId','lineNumber','columnNumber'])assert.equal(installed.actualLocation[key],location[key],'no breakpoint relocation');
      points.set(installed.breakpointId,point);record.points.push({...point,actualLocation:installed.actualLocation});
    }
  }catch(error){record.status='NOT_OBSERVED';record.errors.push({stage:'arm',message:error.message});await dispose();throw error;}
  return {record,dispose};
}
