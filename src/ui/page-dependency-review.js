import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
import {digestUtf8} from '../platform/protocol.js';
import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {hasUnbuiltESM} from './esm-source-detector.js';

// Source-attached actions; durable bytes/approvals stay in the existing manager.
export function createPageDependencyReview({client,resolver,getSource,isAvailable=()=>true,
  api=globalThis.chrome,document:doc=globalThis.document,onState=()=>{}}) {
  const parent=doc.getElementById('manual-source-editor');
  if(!parent)return {update(){},dispose(){}};
  const node=(tag,id,text)=>{const el=doc.createElement(tag);if(id)el.id=id;if(text)el.textContent=text;return el;};
  const root=node('details','network-js-review');root.className='od-stack';root.hidden=true;
  const summary=node('summary',null,'网络 JS：下载准备与审核');
  const state=node('p','network-js-status');state.setAttribute('role','status');state.setAttribute('aria-live','polite');
  const prepare=node('button','network-js-prepare','下载并准备依赖');prepare.type='button';
  const worldLabel=node('label'),world=node('select','network-js-world');
  worldLabel.append(node('span',null,'依赖用途'),world);worldLabel.hidden=true;
  for(const [value,text] of [['esm-page','用于网页 Page'],['esm-controller','用于 Controller']]) {
    const option=node('option',null,text);option.value=value;world.append(option);
  }
  world.value='esm-page';world.setAttribute('aria-label','静态 import 的运行世界');
  const metadata=node('textarea','network-js-metadata');metadata.readOnly=true;metadata.rows=5;
  metadata.setAttribute('aria-label','待审核的依赖来源、哈希、许可证和风险');metadata.hidden=true;
  const sources=node('div','network-js-sources');sources.className='od-stack';
  const label=node('label'),accept=node('input','network-js-consent');accept.type='checkbox';
  label.append(accept,node('span',null,'我已审核来源、源码、SHA-256 和许可证信息'));label.hidden=true;
  const approve=node('button','network-js-approve','批准这些固定字节');approve.type='button';approve.hidden=true;
  root.append(summary,state,worldLabel,prepare,metadata,sources,label,approve);parent.append(root);
  let disposed=false,working=false,review=null,captured=null,sourceIdentity=null,availableIdentity=null,generation=0,permissionIdentity=null,permissionReady=false,approved=false,notice='';
  const viewed=new Set(),listeners=[],sourceListeners=[];
  const consent=createChromePermissionConsent({api,onChange(){permissionIdentity=null;permissionReady=false;update();}});
  const message=error=>(error?.code||'E_DEPENDENCY_REVIEW')+'：'+(error?.message||String(error));
  const listen=(el,type,fn,list=listeners)=>{el.addEventListener(type,fn);list.push(()=>el.removeEventListener(type,fn));};
  const invalidate=()=>{review=null;captured=null;approved=false;notice='';viewed.clear();accept.checked=false;
    sourceListeners.splice(0).forEach(remove=>remove());metadata.hidden=true;metadata.value='';sources.replaceChildren();label.hidden=true;approve.hidden=true;};
  const assertCurrent=snapshot=>{
    if(disposed||snapshot.generation!==generation||!isAvailable()||getSource()!==snapshot.sourceUtf8||resolver.snapshot().key!==snapshot.key)
      throw {code:'E_DEPENDENCY_LOCK_STALE',message:'准备期间源码或编辑模式已变化；请重新准备，网页尚未运行'};
  };
  const originsFor=report=>[...new Set((report?.requires||[]).filter(row=>row.sourceKind==='https'&&!row.downloadError)
    .map(row=>'https://'+new URL(row.url).hostname+'/*'))];
  function update() {
    if(disposed)return;
    const source=getSource(),parsed=parseUserScriptDependencies(source),available=isAvailable(),esm=hasUnbuiltESM(source);
    const identitySource=JSON.stringify([source,resolver.sourceFormat]);
    if(identitySource!==sourceIdentity||available!==availableIdentity){generation++;sourceIdentity=identitySource;availableIdentity=available;invalidate();permissionIdentity=null;permissionReady=false;}
    root.hidden=!available||!esm&&!parsed.requires.length;
    worldLabel.hidden=!esm;world.disabled=working;
    if(esm)world.value=resolver.sourceFormat;
    prepare.textContent=esm?'下载并准备 '+(world.value==='esm-controller'?'Controller':'Page')+' 依赖':'下载并准备依赖';
    if(root.hidden)return;
    let snapshot;
    try{snapshot=resolver.snapshot();}catch(error){state.textContent=message(error);prepare.disabled=true;approve.disabled=true;return;}
    const report=snapshot.report,origins=originsFor(report),identity=JSON.stringify([snapshot.key,origins]);
    if(identity!==permissionIdentity){
      permissionIdentity=identity;permissionReady=!origins.length;
      if(origins.length)void consent.prepare({origins}).then(result=>{
        if(!disposed&&permissionIdentity===identity){permissionReady=!!result;update();}
      }).catch(error=>{if(!disposed&&permissionIdentity===identity){notice=message(error);state.textContent=notice;}});
    }
    const unsupported=report?.requires?.find(row=>row.downloadError);
    const noDependencies=esm&&Array.isArray(report?.requires)&&report.requires.length===0;
    prepare.disabled=working||!report||noDependencies||!permissionReady||!!unsupported;
    approve.disabled=working||approved||!review||viewed.size!==review.entries.length||!accept.checked;
    state.textContent=notice||(noDependencies?'无需外部依赖；可在所选世界离线编译运行，无需下载或批准。':unsupported?message(unsupported.downloadError):report?.locks?.length===1||report?.selectedLockId
      ? '已有批准版本可离线试运行。重新下载只生成待审核字节，批准前保留原锁。'
      : esm?'按静态 HTTPS import 准备；当前用于 '+(world.value==='esm-controller'?'Controller':'网页 Page')+'。下载、批准与运行独立；其他运行世界需要单独准备批准。':
        '按源码中的 @require 声明准备。下载与批准均不运行网页；批准后另行点击网页试运行。');
  }
  function action(event,operation) {
    if(!event?.isTrusted||disposed||working||!isAvailable())return;
    working=true;update();onState();
    Promise.resolve().then(operation).catch(error=>{if(!disposed)notice=message(error);})
      .finally(()=>{working=false;if(!disposed){update();onState();}});
  }
  listen(prepare,'click',event=>{
    if(!event?.isTrusted||prepare.disabled)return;
    let snapshot,permission;
    try{
      snapshot={...resolver.snapshot(),generation};const origins=originsFor(snapshot.report);
      // Request synchronously from this trusted click, before the first await.
      permission=origins.length?consent.confirm(event,{origins}):Promise.resolve(true);
    }catch(error){notice=message(error);update();return;}
    action(event,async()=>{
      invalidate();notice='正在下载准备；网页尚未运行…';update();await permission;assertCurrent(snapshot);
      const result=await client.request('preparePageDependencies',{sourceUtf8:snapshot.sourceUtf8,
        entryFormat:snapshot.entryFormat,...(snapshot.sourceFormat?{sourceFormat:snapshot.sourceFormat}:{}),explicitUserAction:true});
      assertCurrent(snapshot);
      if(result.manifestDigest!==snapshot.report?.manifestDigest||!Array.isArray(result.entries)||!result.entries.length)
        throw {code:'E_DEPENDENCY_REVIEW',message:'下载回执与声明不符'};
      if(snapshot.sourceFormat&&(result.sourceFormat!==snapshot.sourceFormat||result.world!==snapshot.world))
        throw {code:'E_DEPENDENCY_WORLD',message:'下载回执的运行世界不符，请独立准备批准'};
      captured=snapshot;review=structuredClone(result);
      metadata.value=review.entries.map(row=>`${row.order+1}. ${row.url}\n实际来源：${row.resolvedUrl}\nSHA-256：${row.sha256}\n大小：${row.byteLength} B；许可证：${row.license?.name||'未知，需要自行审阅'}\n${row.risk}`).join('\n\n');
      metadata.hidden=false;label.hidden=false;approve.hidden=false;
      for(const entry of review.entries){
        const button=node('button',null,`查看缓存源码 ${entry.order+1}`);button.type='button';
        const code=node('textarea');code.readOnly=true;code.rows=8;code.hidden=true;code.setAttribute('aria-label',`依赖 ${entry.order+1} 的完整缓存源码`);
        listen(button,'click',event=>action(event,async()=>{
          assertCurrent(snapshot);
          const bytes=await client.request('readPageDependencyReview',{reviewId:result.reviewId,order:entry.order});
          assertCurrent(snapshot);
          if(bytes.reviewId!==result.reviewId||bytes.order!==entry.order||bytes.sha256!==entry.sha256||
            typeof bytes.code!=='string'||await digestUtf8(bytes.code)!==entry.sha256)
            throw {code:'E_DEPENDENCY_HASH',message:'缓存原文与审核 SHA-256 不符'};
          assertCurrent(snapshot);code.value=bytes.code;code.hidden=false;viewed.add(entry.order);
          notice='已显示固定缓存原文；哈希不代表代码可信，请逐项审阅后再批准。';
        }),sourceListeners);
        sources.append(button,code);
      }
      notice='下载准备完成。请逐项查看缓存源码，审核来源、哈希与许可证后批准；网页尚未运行。';
    });
  });
  listen(accept,'change',update);
  listen(approve,'click',event=>{
    if(approve.disabled)return;
    const frozen=review,snapshot=captured;
    action(event,async()=>{
      assertCurrent(snapshot);
      const lock=await client.request('approvePageDependencies',{reviewId:frozen.reviewId,explicitUserAction:true,
        acceptedHashes:frozen.entries.map(row=>row.sha256)});
      assertCurrent(snapshot);resolver.accept(lock,snapshot);approved=true;
      notice='已明确批准这些固定字节。网页尚未运行；请单独点击'+(snapshot.sourceFormat==='esm-controller'?'运行草稿':'网页试运行')+'。';
    });
  });
  listen(world,'change',()=>{
    if(working||disposed){world.value=resolver.sourceFormat;return;}
    resolver.refresh({sourceFormat:world.value});update();onState();
  });
  update();
  return {update,get busy(){return working;},dispose(){disposed=true;consent.dispose();listeners.forEach(remove=>remove());sourceListeners.forEach(remove=>remove());root.remove?.();}};
}
