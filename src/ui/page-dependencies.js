import {parseUserScriptDependencies, assessUserScriptExecution, assertUserScriptExecutable} from '../scripting/user-scripts/dependency-metadata.js';
import {bytesToBase64} from '../platform/page-port/codec.js';

const warningText = {
  W_USER_SCRIPT_ISOLATION:'本模式始终使用隔离 USER_SCRIPT；@grant none 不会切换到网页 MAIN，也不提供 unsafeWindow 或 GM API。',
  W_RUN_AT_DEFAULT:'未声明 @run-at，正式页面合同按 document-idle 解释。',
  W_PREVIEW_TIMING:'这是当前主文档的即时调试；不会重放 @run-at 时机，也不会安装自动运行。',
  W_SHARED_COMPILATION_UNIT:'经典脚本与依赖按原顺序合成一个编译单元；顶层严格模式和变量声明可能互相影响。IIFE 内的严格模式保持其原有作用域。',
  W_DEPENDENCY_WEAK_INTEGRITY:'弱哈希仅保留为来源信息；所有已声明的 SHA-256/384/512 都必须验证通过。'
};
const errorText = {
  E_GRANT_UNSUPPORTED:'脚本声明了尚未实现的 GM 或宿主权限，可以编辑，但不能运行。',
  E_RESOURCE_UNSUPPORTED:'已识别 @resource；资源 API 尚未实现，不能静默跳过运行。',
  E_CONNECT_UNSUPPORTED:'@connect 不能自动授予宿主网络权限。',
  E_WORLD_NOT_APPROVED:'本阶段不支持网页 MAIN 世界；请保留明确的隔离执行方式。'
};
export const dependencyMessage = item => (item?.code ? item.code + '：' : '') +
  (warningText[item?.code] || errorText[item?.code] || item?.message || String(item));
const requireKey = (parsed,entryFormat) => JSON.stringify({entryFormat,importSourceUrl:parsed.importSourceUrl,
  requires:parsed.requires.map(row=>({raw:row.raw,url:row.url,integrity:row.integrity}))});

// This panel only edits declarations and sends explicit review actions to the
// authenticated broker. It never downloads or evaluates third-party code.
export function createPageDependencyPanel({client,api,document:doc,getSource,setSource,onState=()=>{}}) {
  const get = id => doc.getElementById(id), listeners = [], picks = new Map();
  let disposed=false,busy=false,sequence=0,sourceKey=null,report=null,review=null,parsed,admission;
  const mode = () => get('page-preview-entry').value || 'async-main';
  const listen = (id,event,fn) => {const node=get(id);node.addEventListener(event,fn);listeners.push([node,event,fn]);};
  const status = (state,text) => {if(disposed)return;const node=get('page-dependency-status');node.dataset.state=state;node.textContent=text;};
  const fail = error => status('error',dependencyMessage(error));
  const inputs = () => ({sourceUtf8:getSource(),entryFormat:mode()});
  function controls() {
    if(disposed)return;
    get('page-dependency-prepare').disabled=busy || !parsed?.requires.length || !report || admission?.status==='unsupported';
    get('page-dependency-approve').disabled=busy || !review || admission?.status==='unsupported';
    get('page-dependency-lock').disabled=busy || !report?.locks?.length;
    get('page-dependency-refresh').disabled=busy;
    get('page-dependency-add').disabled=busy;
    get('page-preview-jquery').disabled=Boolean(parsed?.requires.length) || mode()!=='async-main';
    // The review uses the exact choices captured when the user clicked.
    for (const select of picks.values()) select.disabled=busy;
    for (const id of ['page-dependency-local-file','page-dependency-local-order','page-dependency-url'])
      get(id).disabled=busy;
    onState();
  }
  function showAdmission() {
    const messages = [...(admission?.blockers || []),...(admission?.warnings || [])].map(dependencyMessage);
    get('page-dependency-warnings').textContent=messages.join('\n');
    get('page-dependency-warnings').hidden=!messages.length;
  }
  function renderSources(rows) {
    const container=get('page-dependency-sources');container.replaceChildren();picks.clear();
    const localOrder=get('page-dependency-local-order');localOrder.replaceChildren(new Option('选择对应声明',''));
    for(const row of rows) {
      const block=doc.createElement('div');block.className='dependency-source';
      const label=doc.createElement('label');
      label.textContent=`${row.order+1}. ${row.name || row.originalUrl || row.raw}${row.version ? ' · '+row.version : ''}`;
      const origin=doc.createElement('p');origin.className='hint';origin.textContent=row.url || row.raw;
      const select=doc.createElement('select');select.setAttribute('aria-label',`依赖 ${row.order+1} 的获取来源`);
      select.append(new Option(row.sourceKind==='packaged'?'读取扩展内固定字节（不访问 CDN）':'下载当前 URL，作为新版本审核',''));
      for(const cached of row.cacheChoices || []) select.append(new Option(`已确认缓存 · ${cached.sha256.slice(0,12)} · ${cached.sourceKind}`,cached.sha256));
      if(row.cacheChoices?.length===1) select.value=row.cacheChoices[0].sha256;
      label.append(select);block.append(label,origin);container.append(block);picks.set(row.order,select);
      localOrder.append(new Option(`${row.order+1}. ${row.name || row.originalUrl || row.raw}`,String(row.order)));
    }
  }
  function renderLocks(locks,preferred) {
    const select=get('page-dependency-lock');
    select.replaceChildren(new Option(locks.length?'选择已确认的固定版本':'尚未锁定',''));
    for(const lock of locks) select.append(new Option(
      `已确认 · ${new Date(lock.approvedAt).toLocaleString()} · ${lock.entries.map(row=>row.sha256.slice(0,8)).join(' / ')}`,lock.lockId));
    if(locks.some(row=>row.lockId===preferred)) select.value=preferred;
    else if(locks.length===1) select.value=locks[0].lockId;
  }
  async function inspect(force=false,preferred) {
    if(disposed)return;
    parsed=parseUserScriptDependencies(getSource());
    const key=requireKey(parsed,mode());
    admission=assessUserScriptExecution(parsed,{entryFormat:mode(),dependenciesLocked:Boolean(get('page-dependency-lock').value)});
    showAdmission();
    if(!force && key===sourceKey){controls();return;}
    const version=++sequence;sourceKey=key;report=null;review=null;
    get('page-dependency-review').textContent='';get('page-dependency-review').hidden=true;
    get('page-dependency-local-file').value='';
    renderLocks([],null);
    if(!parsed.requires.length){
      get('page-dependency-sources').replaceChildren();picks.clear();
      status(admission.status==='unsupported'?'error':'empty',admission.status==='unsupported'?'元数据含不支持的执行语义，请查看下方说明。':'源码没有 @require；可以直接试运行。');
      controls();return;
    }
    status('reading','正在读取依赖声明和本机已确认版本…');controls();
    try {
      const result=await client.request('inspectPageDependencies',inputs());
      if(disposed || version!==sequence)return;
      report=result;admission=result.admission;renderSources(result.requires);renderLocks(result.locks,preferred);showAdmission();
      status(admission.status==='unsupported'?'error':get('page-dependency-lock').value?'locked':'needs-review',
        admission.status==='unsupported'?'已理解源码；不支持的执行语义仍会阻断运行。':
        get('page-dependency-lock').value?'已选择依赖锁；运行时仍会校验本地字节。修改正文无需重新锁定。':
        '请确认获取来源，读取资源后再审核并锁定；本步骤不会运行脚本。');
    } catch(error){if(!disposed && version===sequence)fail(error);}
    finally {if(!disposed && version===sequence)controls();}
  }
  function capture() {
    const current=inputs(),metadata=parseUserScriptDependencies(current.sourceUtf8);
    const key=requireKey(metadata,current.entryFormat),lockId=key===sourceKey ? get('page-dependency-lock').value || null : null;
    assertUserScriptExecutable(metadata,{entryFormat:current.entryFormat,phase:'preview',dependenciesLocked:!metadata.requires.length || Boolean(lockId)});
    return {...current,lockId:metadata.requires.length ? lockId : null};
  }
  function prepare(event) {
    if(!event.isTrusted || disposed || busy || !report)return;
    let captured,selections,permission,file,localOrder;
    try {
      captured=inputs();const metadata=parseUserScriptDependencies(captured.sourceUtf8);
      if(requireKey(metadata,captured.entryFormat)!==sourceKey)throw {code:'E_DEPENDENCY_LOCK_STALE',message:'依赖声明已变化，请先刷新依赖列表'};
      assertUserScriptExecutable(metadata,{entryFormat:captured.entryFormat,dependenciesLocked:true});
      selections=[];
      for(const [order,select] of picks) if(select.value) selections.push({order,assetSha256:select.value});
      file=get('page-dependency-local-file').files?.[0];localOrder=Number(get('page-dependency-local-order').value);
      if(file){
        if(!get('page-dependency-local-order').value || !Number.isInteger(localOrder) || !picks.has(localOrder))
          throw {code:'E_DEPENDENCY_LOCAL',message:'请选择本地文件对应的 @require 声明'};
        if(file.size>1024*1024)throw {code:'E_DEPENDENCY_LIMIT',message:'单个依赖最多 1 MiB'};
        selections=selections.filter(row=>row.order!==localOrder);
      }
      const origins=[...new Set(report.requires.filter(row=>row.sourceKind==='https' && row.url &&
        !selections.some(choice=>choice.order===row.order) && !(file && localOrder===row.order))
        .map(row=>`https://${new URL(row.url).hostname}/*`))];
      // Request only download origins, synchronously inside this trusted click.
      // Running-page permission is handled later by the independent Run action.
      permission=origins.length ? api.permissions.request({origins}) : Promise.resolve(true);
    } catch(error){fail(error);return;}
    const version=sequence;busy=true;review=null;controls();status('downloading','正在读取资源、校验原始字节并生成待审核记录…');
    (async()=>{
      if(!await permission)throw {code:'E_DEPENDENCY_PERMISSION',message:'用户未授权依赖下载来源'};
      if(disposed || version!==sequence)return;
      if(file)selections.push({order:localOrder,localFile:{name:file.name,bytesBase64:bytesToBase64(new Uint8Array(await file.arrayBuffer()))}});
      if(disposed || version!==sequence)return;
      const result=await client.request('preparePageDependencies',{...captured,explicitUserAction:true,selections});
      if(disposed || version!==sequence)return;
      review=result;
      get('page-dependency-review').textContent=result.entries.map(row=>
        `${row.order+1}. ${row.name}${row.version?' · '+row.version:''}\n声明：${row.originalUrl}\n实际来源：${row.resolvedUrl}\n获取方式：${row.acquisition}\n字节：${row.byteLength}\nSHA-256：${row.sha256}\n许可证：${row.license?.status==='known'?row.license.name:'未知或尚未核实'}\n${row.risk}`).join('\n\n');
      get('page-dependency-review').hidden=false;
      status('pending-review','资源已缓存，尚未批准。请核对实际来源与 SHA-256，再点击“确认来源并锁定”。');
    })().catch(error=>{if(version===sequence)fail(error);}).finally(()=>{busy=false;controls();});
  }
  function approve(event) {
    if(!event.isTrusted || disposed || busy || !review)return;
    const captured=review,version=sequence;busy=true;controls();status('approving','正在确认这组固定资源…');
    (async()=>{
      const result=await client.request('approvePageDependencies',{reviewId:captured.reviewId,explicitUserAction:true,
        acceptedHashes:captured.entries.map(row=>row.sha256)});
      if(disposed || version!==sequence)return;
      review=null;await inspect(true,result.lockId);
    })().catch(error=>{if(version===sequence)fail(error);}).finally(()=>{busy=false;controls();});
  }
  function add(event) {
    if(!event.isTrusted || disposed || busy)return;
    try {
      const url=get('page-dependency-url').value.trim(),test=parseUserScriptDependencies('// ==UserScript==\n// @require '+url+'\n// ==/UserScript==');
      if(!url || test.diagnostics.some(row=>row.severity==='error') || test.requires.length!==1 || !test.requires[0].url)
        throw {code:'E_DEPENDENCY_URL',message:'请输入一个有效的 HTTPS JavaScript 资源地址'};
      const source=getSource(),metadata=parseUserScriptDependencies(source);
      if(metadata.hasHeader && (!metadata.headerComplete || metadata.headerRange?.truncated ||
        metadata.diagnostics.some(row=>row.code==='E_METADATA_HEADER')))
        throw {code:'E_METADATA_HEADER',message:'请先修复现有用户脚本头部；不会插入新头部来隐藏原有声明'};
      const next=metadata.hasHeader && metadata.headerComplete ? source.slice(0,metadata.headerRange.start)+metadata.headerRaw.replace(
        /^([\t ]*\/\/\s*==\/UserScript==[\t ]*\r?$)/m,'// @require '+url+'\n$1')+source.slice(metadata.headerRange.end) :
        '// ==UserScript==\n// @require '+url+'\n// ==/UserScript==\n\n'+source;
      setSource(next);get('page-dependency-url').value='';inspect();
    } catch(error){fail(error);}
  }
  listen('page-dependency-add','click',add);listen('page-dependency-prepare','click',prepare);listen('page-dependency-approve','click',approve);
  listen('page-dependency-refresh','click',event=>{if(event.isTrusted)inspect(true,get('page-dependency-lock').value);});
  listen('page-dependency-lock','change',()=>{status(get('page-dependency-lock').value?'locked':'needs-review',
    get('page-dependency-lock').value?'已选择固定锁；执行前校验缓存字节，不会重新向 CDN 下载。':'请选择已确认版本或读取并锁定新的资源。');controls();});
  listen('page-preview-entry','change',()=>inspect(true));listen('script-source','input',()=>inspect());
  client.ready.then(()=>inspect()).catch(fail);
  return {capture,get busy(){return busy;},refresh:inspect,dispose(){disposed=true;sequence++;
    for(const [node,event,fn] of listeners)node.removeEventListener(event,fn);listeners.length=0;}};
}
