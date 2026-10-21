(() => {
'use strict';
const {root,request,setState,setNavigation}=globalThis.OpenDeskTool;
const model=globalThis.OpenDeskPromptShortcutsModel,el=id=>root.querySelector('#'+id);
const dom=(tag,cls='',text='')=>{const n=root.ownerDocument.createElement(tag);n.className=cls;n.textContent=text;return n;};
const KEY='library',MENU_ACTION='add-selection';
let data=model.defaults(),etag=null,ready=false,busy=false,dirty=false,mode='index',editId=null;
let baseline='',expanded=null,pendingDelete=null,pendingLeave=null,unconfirmedWrite=false,returnFocusId=null;
 const imageAssets=new Map();let draftImageAssetId='',uploadBusy=false;
let stagedImport=null,stagedEtag=null,replaceArmed=false,transferBusy=false,importTicket=0;
const SITE_KEY='sites';
let sites=model.sitesDefaults(),sitesEtag=null,sitesReady=false,siteBusy=false,siteDetecting=false,siteDirty=false,siteUnconfirmedWrite=false;
let siteOrigin=null,siteEditing=null,siteBaseline='',siteVerified=null,siteDelete=null;
let sitePoll=0,siteSession=null,siteStarting=0,siteEpoch=0,siteDiscardPending=false;
function report(){setState({dirty:dirty||siteDirty||Boolean(stagedImport),busy:busy||siteBusy||siteDetecting||transferBusy||uploadBusy});}
// The sandbox owns business navigation; the verified Host owns presentation only.
function publishNavigation(){
  if(typeof setNavigation!=='function')return;
  const page=mode==='index'?'index':editId?'edit':'create';
  const title={index:'提示词快捷按钮',create:'新建提示词',edit:'编辑提示词'}[page];
  const state={page,title,canBack:page!=='index',...(page==='index'?{primary:'new'}:{})};
  if(setNavigation(state)===true)root.querySelector('.ps')?.classList.add('ps-host-nav');
}
function status(message='',isError=false){const n=el('ps-status');n.textContent=message;n.hidden=!message;n.dataset.error=String(isError);}
// Keep the original one-Host lifecycle: remove only unreferenced assets and
// surface cleanup errors rather than silently leaking local raster storage.
function removeUnreferencedAsset(id){
  if(!id||data.items.some(row=>row.imageAssetId===id))return;
  void request('prompt.asset.remove',{id}).then(reply=>{
    if(typeof reply?.removed!=='boolean')throw Error('图片清理回执无效');
    imageAssets.delete(id);
  }).catch(e=>{
    if(e?.code==='E_IMAGE_REFERENCED')return; // Concurrent save protected the image.
    status('未引用图片清理未确认：'+(e?.code||e?.message||'未知错误')+
      '。图片仍保留在本机；重新选择同一图片后点击移除可重试。',true);
  });
}
function error(message=''){el('ps-error').textContent=message;el('ps-error').hidden=!message;}
function bodyError(message=''){el('ps-body-error').textContent=message;el('ps-body-error').hidden=!message;}
function options(open){
  el('ps-setting-fields').hidden=!open;
  el('ps-toggle-settings').setAttribute('aria-expanded',String(open));
  const caret=el('ps-toggle-caret');caret.replaceChildren(icon('chevron-down'));
  caret.classList.toggle('is-open',open);
  el('ps-toggle-settings').setAttribute('aria-label',open?'收起按钮设置':'展开按钮设置');
}
function form(){
  const previous=editId?data.items.find(item=>item.id===editId):null;
  const local=el('ps-image-source-local').checked;
  return {body:el('ps-body').value,label:el('ps-label').value,name:el('ps-name').value,
    shape:previous?.shape==='round'?'round':'square',enabled:el('ps-enabled').checked,
    appearance:el('ps-appearance-image').checked?'image':'text',
    imageUrl:local?'':el('ps-image-url').value,imageAssetId:local?draftImageAssetId:''};
}

 // Local raster processing only. Bytes are stored via the trusted Host, separately from text.
 async function encodeLocalImage(file){
   if(!['image/png','image/jpeg','image/webp'].includes(file?.type))
     throw Error('只支持 PNG、JPEG、WebP；不支持 SVG');
   if(file.size<1||file.size>2*1024*1024)throw Error('原图必须小于 2 MiB');
   if(typeof globalThis.createImageBitmap!=='function')throw Error('当前环境不支持图片解码');
   const bitmap=await globalThis.createImageBitmap(file);
   try{
     if(!bitmap.width||!bitmap.height||bitmap.width>8192||bitmap.height>8192||
       bitmap.width*bitmap.height>16000000)throw Error('图片像素尺寸过大');
     const canvas=root.ownerDocument.createElement('canvas'),ctx=canvas.getContext('2d');
     if(!ctx)throw Error('浏览器不支持图片压缩');
     for(const longest of [256,224,192,160,128,96]){
       const ratio=Math.min(1,longest/Math.max(bitmap.width,bitmap.height));
       canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
       canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
       ctx.clearRect(0,0,canvas.width,canvas.height);
       ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
       for(const quality of [.82,.72,.6,.48]){
         const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
         if(blob&&['image/png','image/jpeg','image/webp'].includes(blob.type)&&blob.size>=12&&blob.size<=65536){
           const dataUrl=await new Promise((resolve,reject)=>{
             const reader=new FileReader();
             reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('读取压缩图片失败'));
             reader.readAsDataURL(blob);
           });
           if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:'+blob.type+';base64,'))
             throw Error('压缩后图片格式无效');
           return {dataUrl,mime:blob.type,bytes:blob.size};
         }
       }
     }
     throw Error('无法将此图片压缩到 64 KiB');
   }finally{bitmap.close?.();}
 }
 async function uploadImage(){
   const input=el('ps-image-file'),file=input.files?.[0];input.value='';
   if(!file||mode!=='form'||uploadBusy||busy||unconfirmedWrite)return;
   uploadBusy=true;lock();el('ps-image-help').textContent='正在处理并保存图片…';
   try{
     const image=await encodeLocalImage(file);
     const receipt=await request('prompt.asset.put',{mime:image.mime,dataUrl:image.dataUrl});
     const id=model.normalizeImageAssetId(receipt?.id);
     if(!id||receipt.bytes!==image.bytes)throw Error('图片保存回执未确认，请重新打开核对');
     const previous=draftImageAssetId;
     imageAssets.set(id,image.dataUrl);draftImageAssetId=id;
     el('ps-image-source-local').checked=true;el('ps-image-source-url').checked=false;
     changed();
     el('ps-image-help').textContent='图片已保存至本机资源库（'+image.bytes+' B），请保存提示词完成关联。';
     if(previous&&!data.items.some(row=>row.imageAssetId===previous))
       removeUnreferencedAsset(previous);
   }catch(e){
     error('图片上传失败：'+(e.code||e.message)+'。已有草稿与图片保持不变。');
     el('ps-image-help').textContent='可重新选择本地图片，或切换 HTTPS 图片网址。';
   }finally{uploadBusy=false;lock();}
 }
 async function hydrateImageAssets(rows){
   const ids=[...new Set(rows.map(row=>row.imageAssetId).filter(Boolean))];
   for(const id of ids){
     try{const a=await request('prompt.asset.get',{id});
       if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(a?.dataUrl))
         imageAssets.set(id,a.dataUrl);
     }catch{/* A missing image must not hide the user's saved prompt. */}
   }
 }
function projected(){
  const draft=form(),old=editId?data.items.find(row=>row.id===editId):null;
  if(!draft.body.trim())return null;
  try{
    const row=model.draft(draft,old,()=> '00000000-0000-4000-8000-000000000000');
    return model.load({...data,items:old?data.items.map(item=>item.id===old.id?row:item):
      [...data.items,{...row,order:data.items.length}]});
  }catch{return null;}
}
// Use native <img> and textContent only; URLs were bounded by the shared trusted model.
function picture(holder,row,{live=false}={}){
  const label=row.label||model.auto(row.body||'')||'…';
  const fallback=()=>{holder.classList.toggle('has-image',false);holder.dataset.imageUrl='';
    holder.replaceChildren(...model.parts(label).map(part=>dom('span','',part)));};
  if(row.appearance!=='image'){fallback();return;}
  let url,sourceKey;
  try{
    if(row.imageAssetId){
      const id=model.normalizeImageAssetId(row.imageAssetId);
      url=imageAssets.get(id);
      if(!url)throw Error('本地图片无法读取，已显示备用短标签；请重新上传或更换来源。');
      sourceKey='asset:'+id;
    }else{url=model.normalizeImageUrl(row.imageUrl,true);sourceKey=url;}
  }catch(e){fallback();if(live)el('ps-image-help').textContent=e.message;return;}
  // Same failed HTTPS URL must not be requested again on every body edit.
  if(holder.dataset.failedImageUrl===sourceKey){
    fallback();
    if(live)el('ps-image-help').textContent='图片加载失败，已回退备用短标签；修改图片 URL 后可重试。';
    return;
  }
  if(holder.dataset.imageUrl===sourceKey&&holder.firstElementChild?.tagName==='IMG')return;
  holder.dataset.failedImageUrl='';holder.dataset.imageUrl=sourceKey;
  holder.classList.add('has-image');
  const img=dom('img');img.alt='';img.decoding='async';img.loading=live?'eager':'lazy';
  img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>{
    if(holder.firstChild!==img||holder.dataset.imageUrl!==sourceKey)return;
    holder.dataset.failedImageUrl=sourceKey;fallback();
    if(live)el('ps-image-help').textContent='图片加载失败，已显示备用短标签；请检查 URL、格式或网络限制。';
  });
  img.addEventListener('load',()=>{if(holder.dataset.imageUrl===sourceKey&&!img.naturalWidth)img.dispatchEvent(new Event('error'));});
  holder.replaceChildren(img);img.src=url;
  if(live)el('ps-image-help').textContent=row.imageAssetId?'已保存至本机资源库；完整显示、不裁剪。':'图片完整显示、不裁剪；加载失败显示短标签。远程服务器会收到图片请求。';
}
function preview(){
  const draft=form(),fallback=model.auto(draft.body),label=draft.label.trim()||fallback;
  const glyph=el('ps-preview-glyph');
  glyph.replaceChildren(...model.parts(label||'—').map(char=>dom('span','',char)));
  el('ps-preview-name').textContent=draft.name.trim()||fallback||'待生成';
  const image=draft.appearance==='image',local=el('ps-image-source-local').checked;
  el('ps-image-fields').hidden=!image;
  el('ps-image-upload-controls').hidden=!local;
  el('ps-image-url-row').hidden=local;
  el('ps-image-clear').hidden=!draftImageAssetId;
  if(image){
    const holder=el('ps-image-preview'),dims=model.IMAGE_SIZES[data.settings.imageSize]||model.IMAGE_SIZES.large;
    holder.style.width=dims[0]+'px';holder.style.height=dims[1]+'px';
    // Avoid re-requesting the same remote image when the prompt body is edited.
    const token=JSON.stringify([draft.imageAssetId,draft.imageUrl,label,data.settings.imageSize]);
    if(holder.dataset.token!==token){
      holder.dataset.token=token;
      picture(holder,{...draft,label}, {live:true});
    }
  }else{
    el('ps-image-preview').replaceChildren();
    delete el('ps-image-preview').dataset.token;
  }
  const estimate=projected(),bytes=estimate?model.bytes(estimate):null;
  el('ps-quota-value').textContent=(bytes===null?'—':bytes)+' / 8192 B';
  el('ps-quota').dataset.error=String(bytes!==null&&bytes>8192);
  el('ps-quota').hidden=bytes===null||bytes<Math.ceil(8192*0.85);
}
function changed(){
  if(mode!=='form')return;
  dirty=JSON.stringify(form())!==baseline;if(el('ps-body').value.trim())bodyError('');preview();report();
}
function lock(){
  for(const id of ['ps-new','ps-save','ps-save-next','ps-web','ps-transfer','ps-image-size'])
    el(id).disabled=!ready||busy||uploadBusy||transferBusy||unconfirmedWrite||
      (id==='ps-new'&&Boolean(stagedImport))||(id==='ps-image-size'&&Boolean(stagedImport));
  const blocked=!ready||busy||uploadBusy||transferBusy||unconfirmedWrite;
   el('ps-image-size-setting').querySelectorAll('[data-image-size]').forEach(button=>{
     button.disabled=blocked||Boolean(stagedImport);
   });
   for(const id of ['ps-image-pick','ps-image-clear'])el(id).disabled=blocked;
  el('ps-import').disabled=blocked;
  el('ps-export').disabled=blocked||Boolean(stagedImport);
  const append=stagedImport?importCandidate('append'):null;
  const replace=stagedImport?importCandidate('replace'):null;
  el('ps-import-cancel').disabled=busy||transferBusy;
  el('ps-import-append').disabled=blocked||!append||Boolean(append.error||append.overLimit||append.added===0);
  el('ps-import-replace').disabled=blocked||!replace||Boolean(replace.error||replace.overLimit);
  for(const id of ['ps-cancel','ps-discard'])el(id).disabled=busy;
  el('ps-form').setAttribute('aria-busy',String(busy));
  el('ps-save').textContent=busy?'保存中…':'保存';
  el('ps-save-next').textContent=busy?'保存中…':'保存并继续';
  for(const b of el('ps-list').querySelectorAll('button'))b.disabled=!ready||busy||transferBusy||unconfirmedWrite||Boolean(stagedImport)||b.dataset.locked==='1';
  report();
}
function index(){
  if(draftImageAssetId&&!data.items.some(item=>item.imageAssetId===draftImageAssetId))
    removeUnreferencedAsset(draftImageAssetId);
  draftImageAssetId='';
  const focusId=returnFocusId;returnFocusId=null;
  mode='index';editId=null;dirty=false;pendingLeave=null;pendingDelete=null;
  el('ps-index').hidden=false;el('ps-edit').hidden=true;el('ps-leave').hidden=true;
  error('');bodyError('');render();
  if(focusId)focusListAction(focusId,'more');
  report();publishNavigation();
}
function back(callback=index){
  if(busy||uploadBusy||transferBusy||siteBusy||siteUnconfirmedWrite||unconfirmedWrite){
    if(unconfirmedWrite)error('上次保存结果尚未确认，草稿仍保留；请重新打开核对，不能直接放弃。');
    return;
  }
  if(!dirty){callback();return;}
  pendingLeave=callback;el('ps-leave').hidden=false;el('ps-stay').focus();
}
function start(id=null,preset=''){
  if(!ready||busy||uploadBusy||transferBusy||unconfirmedWrite||stagedImport)return;
  const row=id?data.items.find(item=>item.id===id):null;
  if(id&&!row){status('原条目已变化，请重新打开工具核对。',true);return;}
  mode='form';editId=id;returnFocusId=id;expanded=null;pendingDelete=null;
  el('ps-index').hidden=true;el('ps-edit').hidden=false;
  el('ps-save-next').hidden=Boolean(id);
  el('ps-form-title').textContent=id?'编辑提示词':'新建提示词';
  el('ps-body').value=row?.body??preset;
  el('ps-label').value=row&&!row.labelAuto?row.label:'';
  el('ps-name').value=row&&!row.nameAuto?row.name:'';
  el('ps-appearance-image').checked=row?.appearance==='image';
  el('ps-appearance-text').checked=row?.appearance!=='image';
  draftImageAssetId=row?.imageAssetId||'';
  el('ps-image-source-local').checked=Boolean(draftImageAssetId)||!row?.imageUrl;
  el('ps-image-source-url').checked=!el('ps-image-source-local').checked;
  el('ps-image-url').value=row?.imageUrl||'';
  delete el('ps-image-preview').dataset.token;
  el('ps-enabled').checked=row?.enabled!==false;error('');bodyError('');options(true);el('ps-leave').hidden=true;
  // A native-menu selection is an unsaved new draft, never an acknowledged baseline.
  baseline=JSON.stringify({...form(),body:row?.body??''});changed();publishNavigation();el('ps-body').focus();
}
function button(parent,text,callback,variant='secondary'){
  const b=dom('button','od-button od-button--'+variant,text);b.type='button';
  b.addEventListener('click',callback);parent.append(b);return b;
}


const ICON_PATHS=Object.freeze({
  plus:['M12 5v14','M5 12h14'],
  more:['M5 12h.01','M12 12h.01','M19 12h.01'],
  pencil:['M12 20h9','M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
  eye:['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z','M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  'eye-off':['M10.6 5.1A11 11 0 0 1 12 5c7 0 10 7 10 7a14 14 0 0 1-4 4.8','M6.5 6.5A15 15 0 0 0 2 12s3 7 10 7a11 11 0 0 0 5.5-1.5','M3 3l18 18','M10 10a3 3 0 0 0 4 4'],
  up:['M12 19V5','M5 12l7-7 7 7'],
  down:['M12 5v14','M5 12l7 7 7-7'],
  copy:['M8 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8Z','M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'],
  trash:['M3 6h18','M8 6V4h8v2','M6 6l1 15h10l1-15','M10 10v7','M14 10v7'],
  'chevron-down':['M6 9l6 6 6-6'],
  transfer:['M7 7h14','M17 3l4 4-4 4','M17 17H3','M7 13l-4 4 4 4'],
  export:['M12 21V9','M8 13l4-4 4 4','M4 7V3h16v4'],
  import:['M12 3v12','M8 11l4 4 4-4','M4 17v4h16v-4']
});
function icon(name){
  const doc=root.ownerDocument,ns='http://www.w3.org/2000/svg';
  const svg=doc.createElementNS(ns,'svg');
  svg.setAttribute('class','ps-icon-svg');svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  for(const d of ICON_PATHS[name]||[]){
    const path=doc.createElementNS(ns,'path');path.setAttribute('d',d);svg.append(path);
  }
  return svg;
}
function iconButton(parent,name,label,callback,action,itemId,{danger=false,disabled=false}={}){
  const b=dom('button','od-icon-button ps-action-control'+(danger?' od-icon-button--danger':''));
  b.type='button';b.title=label;b.setAttribute('aria-label',label);
  b.dataset.action=action;b.dataset.itemId=itemId;b.dataset.locked=disabled?'1':'0';
  b.disabled=disabled;b.append(icon(name));
  b.addEventListener('click',callback);parent.append(b);return b;
}
function focusListAction(id,action){
  const b=Array.from(el('ps-list').querySelectorAll('button'))
    .find(node=>node.dataset.itemId===id&&node.dataset.action===action);
  b?.focus({preventScroll:true});return b;
}

function siteMessage(text='',isError=false){
  const n=el('ps-site-status');n.textContent=text;n.hidden=!text;n.dataset.error=String(isError);
}
function siteLock(){
  const writeLocked=siteBusy||siteUnconfirmedWrite,locked=writeLocked||siteDetecting;
  for(const id of ['ps-site-current','ps-site-save','ps-site-test','ps-site-auto','ps-pick-container','ps-pick-editor'])
    el(id).disabled=locked;
  for(const button of el('ps-sites-list').querySelectorAll('button'))button.disabled=locked;
  // Cancellation can invalidate an in-flight detection immediately.
  el('ps-site-cancel').disabled=writeLocked;
  el('ps-sites-open').disabled=locked;
  el('ps-site-form').setAttribute('aria-busy',String(siteBusy||siteDetecting));
  report();
}
function siteKey(row){return row.origin+'|'+row.pathScope;}
function siteDraft(){
  return {origin:siteOrigin,pathScope:el('ps-site-path').value||'/',
    containerSelector:el('ps-site-container').value,editorSelector:el('ps-site-editor').value,
    enabled:el('ps-site-enabled').checked};
}
function invalidateSite(){
  siteVerified=null;el('ps-site-verified').textContent='两个目标发生变化，请重新测试。';
  siteDirty=Boolean(siteOrigin&&JSON.stringify(siteDraft())!==siteBaseline);
  siteDiscardPending=false;report();
}
async function readSites(){
  const saved=await request('storage.get',{key:SITE_KEY,withEtag:true});
  if(!/^[a-f0-9]{64}$/.test(saved?.etag||'')||!Object.hasOwn(saved,'value'))
    throw Error('没有收到网站规则的可验证存储版本');
  return {data:model.sitesLoad(saved.value),etag:saved.etag};
}
async function loadSites(){
  const result=await readSites();sites=result.data;sitesEtag=result.etag;sitesReady=true;
  renderSites();return sites;
}
async function commitSites(next){
  if(siteUnconfirmedWrite)throw Object.assign(
    Error('上次网站规则写入结果未知，请保留草稿并重新打开核对'),{code:'E_OUTCOME_UNKNOWN'});
  if(!sitesReady||siteBusy||!sitesEtag)throw Error('网站规则尚未就绪');
  const normalized=model.sitesLoad(next);
  if(model.bytes(normalized)>8192)throw Error('网站适配规则超出 8 KiB');
  siteBusy=true;siteLock();
  try{
    let reply;
    try{
      reply=await request('storage.set',{key:SITE_KEY,value:normalized,ifMatch:sitesEtag});
      if(reply?.saved!==true||!/^[a-f0-9]{64}$/.test(reply.etag||''))
        throw Error('保存回执不完整');
    }catch(error){
      if(['E_STORAGE_CONFLICT','E_TOOL_DATA_LIMIT'].includes(error?.code))throw error;
      // An invalid acknowledgement does not prove a write failed.
      // Block further writes until the exact intended state is read back.
      siteUnconfirmedWrite=true;
      try{
        const checked=await readSites();
        if(JSON.stringify(checked.data)!==JSON.stringify(normalized))
          throw Error('网站规则读回与本次写入不同');
        reply={etag:checked.etag};
        siteUnconfirmedWrite=false;
      }catch{
        throw Object.assign(Error('保存结果未知；草稿仍保留，请重新打开工具核对，禁止盲目重试'),{
          code:'E_OUTCOME_UNKNOWN'});
      }
    }
    sites=normalized;sitesEtag=reply.etag;renderSites();
  }finally{siteBusy=false;siteLock();}
}
function renderSites(){
  const host=el('ps-sites-list');host.replaceChildren();
  if(!sitesReady){host.append(dom('p','ps-hint','网站规则未加载。'));return;}
  // Fixed-source support is distinct from custom-site configuration and demos.
  for(const [name,detail,mark] of [
    ['ChatGPT','内置适配 · 真实站点仍需验收','内置'],
    ['Claude','候选 CSS 定位 · 需实站验证','可尝试'],
    ['Gemini','对话页默认适配 · 无需逐页配置','内置'],
    ['DeepSeek','对话页默认适配 · 无需逐页配置','内置'],
    ['Perplexity','候选 CSS 定位 · 需实站验证','可尝试'],
    ['Grok','候选 CSS 定位 · 需实站验证','可尝试'],
    ['Cursor Web','当前须在网页手动点选','待验证']
  ]){
    const card=dom('article','ps-site-builtin');
    const info=dom('div');info.append(dom('strong','',name),dom('small','',detail));
    card.append(info,dom('span','',mark));host.append(card);
  }
  if(sites.rules.length)host.append(dom('p','ps-hint','自定义网站 · 仅已验证并保存的规则生效'));
  for(const rule of sites.rules){
    const card=dom('article','ps-site-row');
    const head=dom('div','ps-site-row-heading');
    head.append(dom('strong','',rule.origin),dom('small','',rule.enabled?'已启用':'已停用'));
    const path=dom('small','ps-site-origin','路径：'+rule.pathScope);
    const actions=dom('div','ps-actions');
    button(actions,'编辑',()=>openSiteForm(rule));
    button(actions,rule.enabled?'停用':'启用',()=>void (async()=>{
      try{
        const next={schema:1,rules:sites.rules.map(entry=>siteKey(entry)===siteKey(rule)?
          {...entry,enabled:!entry.enabled}:entry)};
        await commitSites(next);siteMessage('网站启停设置已保存。');
      }catch(error){siteMessage('启停失败：'+(error.code||error.message),true);}
    })());
    if(siteDelete===siteKey(rule)){
      button(actions,'确认删除',()=>void (async()=>{
        try{await commitSites({schema:1,rules:sites.rules.filter(entry=>siteKey(entry)!==siteKey(rule))});
          siteDelete=null;renderSites();siteMessage('网站配置已删除。');
        }catch(error){siteMessage('删除未确认：'+(error.code||error.message),true);}
      })(),'danger');
      button(actions,'取消删除',()=>{siteDelete=null;renderSites();});
    }else button(actions,'删除',()=>{siteDelete=siteKey(rule);renderSites();},'danger');
    card.append(head,path,actions);host.append(card);
  }
  siteLock();
}
function protectSiteDraft(){
  if(!siteDirty)return false;
  siteMessage('请先保存或明确取消当前未保存的网站配置。',true);return true;
}
function openSiteForm(rule){
  if(siteBusy||siteUnconfirmedWrite||siteDetecting||protectSiteDraft())return;
  void stopSitePick();siteVerified=null;siteDiscardPending=false;
  siteEditing=rule?siteKey(rule):null;siteOrigin=rule?.origin||null;
  el('ps-site-form').hidden=false;
  el('ps-site-container').value=rule?.containerSelector||'';
  el('ps-site-editor').value=rule?.editorSelector||'';
  el('ps-site-path').value=rule?.pathScope||'/';
  el('ps-site-enabled').checked=rule?.enabled!==false;
  el('ps-site-origin').textContent=siteOrigin||'请选择当前网站';
  el('ps-site-auto').hidden=!model.siteHint(siteOrigin,rule?.pathScope||'/');
  el('ps-site-form-title').textContent=rule?'编辑网站规则':'配置当前网站';
  el('ps-site-verified').textContent='保存前请在该网站测试定位。';
  siteBaseline=JSON.stringify(siteDraft());siteDirty=false;report();
  el('ps-site-container').focus();
}


// Use the existing trusted page check to validate inert selector candidates.
// Never auto-enable a website or treat successful matching as proof of insertion.
async function autoLocateSite(){
  if(!siteOrigin||siteBusy||siteUnconfirmedWrite||siteDetecting||siteSession||siteStarting)return;
  const token=siteEpoch,initial=JSON.stringify(siteDraft()),origin=siteOrigin;
  let context;
  try{context=await request('prompt.page.context',{});}
  catch(error){siteMessage('无法读取当前网页：'+(error.code||error.message),true);return;}
  if(token!==siteEpoch||siteOrigin!==origin||JSON.stringify(siteDraft())!==initial||
     el('ps-site-form').hidden)return;
  if(context?.status!=='available'||context.origin!==origin){
    siteMessage('请切换回 '+origin+' 再尝试定位。',true);return;
  }
  const hint=model.siteHint(origin,context.path);
  if(!hint){siteMessage('此网页暂无候选定位规则，请使用网页点选。',true);return;}
  siteDetecting=true;siteLock();
  siteMessage('正在当前网页尝试定位 '+hint.name+' 的输入框…');
  try{
    for(const editorSelector of hint.editors){
      for(const containerSelector of hint.containers){
        if(token!==siteEpoch||siteOrigin!==origin||el('ps-site-form').hidden||
           JSON.stringify(siteDraft())!==initial)return;
        const rule=model.siteRule({...siteDraft(),containerSelector,editorSelector});
        let result;
        try{result=await request('prompt.page.check',{rule});}
        catch{continue;} // A missing, duplicate or non-editable candidate is expected.
        if(token!==siteEpoch||siteOrigin!==origin||el('ps-site-form').hidden||
           JSON.stringify(siteDraft())!==initial)return;
        if(result?.valid!==true||result.containerMatches!==1||result.editorMatches!==1||
           result.origin!==origin||!['textarea','input','richtext'].includes(result.editorType))
          continue;
        el('ps-site-container').value=containerSelector;
        el('ps-site-editor').value=editorSelector;
        invalidateSite();
        siteVerified=JSON.stringify(rule);
        el('ps-site-verified').textContent='本页定位通过 · '+result.editorType+' · 未做实际插入测试';
        siteMessage('已找到唯一输入框；保存后启用。请在真实网页测试插入、多行及撤销；不会自动发送。');
        return;
      }
    }
    el('ps-site-verified').textContent='没有唯一可用的候选，请在网页手动点选。';
    siteMessage('自动定位未匹配当前页面；请点选按钮容器和目标输入框。',true);
  }finally{
    if(token===siteEpoch){siteDetecting=false;siteLock();}
  }
}

async function openCurrentSite(){
  if(!sitesReady||siteBusy||siteUnconfirmedWrite||siteDetecting)return;
  if(protectSiteDraft())return;
  try{
    const epoch=siteEpoch;
    const context=await request('prompt.page.context',{});
    if(siteBusy||siteUnconfirmedWrite||siteDirty||siteEpoch!==epoch)return;
    if(context?.status!=='available'||!context.origin)throw Error('请先打开普通网页');
    if(context.origin==='https://chatgpt.com')throw Error('ChatGPT 已内置，无需重新配置');
    const matching=sites.rules.filter(rule=>rule.origin===context.origin&&
      (rule.pathScope==='/'||context.path===rule.pathScope||
      context.path.startsWith(rule.pathScope.endsWith('/')?rule.pathScope:rule.pathScope+'/')))
      .sort((a,b)=>b.pathScope.length-a.pathScope.length)[0];
    if(matching){openSiteForm(matching);return;}
    openSiteForm(null);siteOrigin=context.origin;
    el('ps-site-origin').textContent=context.origin;
    const hint=model.siteHint(context.origin,context.path);
    if(hint)el('ps-site-path').value=hint.pathScope;
    el('ps-site-auto').hidden=!hint;
    siteBaseline=JSON.stringify(siteDraft());siteDirty=false;report();
    if(hint)void autoLocateSite();
    else siteMessage('暂无该网站候选规则，请在网页选择容器和输入框，测试后保存。');
  }catch(error){siteMessage(error.code||error.message,true);}
}
async function cancelSiteSession(session,token){
  const notify=!siteSession&&!siteStarting;
  try{
    const result=await request('prompt.page.pick.cancel',{session});
    if(result?.state!=='cancelled')throw Error('网页未确认退出元素选择');
    if(notify&&token===siteEpoch&&!siteSession&&!siteStarting)
      siteMessage('选择已取消，网站配置草稿已保留。');
  }catch(error){
    if(notify&&token===siteEpoch&&!siteSession&&!siteStarting)
      siteMessage('取消选择未确认：'+(error.code||error.message)+'。草稿仍保留，请在网页按 Esc 退出选择。',true);
  }
}
async function stopSitePick(){
  ++siteEpoch;clearTimeout(sitePoll);sitePoll=0;
  const session=siteSession,starting=siteStarting;siteSession=null;siteStarting=0;
  if(session)await cancelSiteSession(session,siteEpoch);
  else if(starting)siteMessage('正在取消选择，等待网页确认；网站配置草稿已保留。');
}
async function pickSite(kind){
  if(!siteOrigin||siteBusy||siteDetecting||siteSession||siteStarting)return;
  const field=el(kind==='editor'?'ps-site-editor':'ps-site-container');
  const token=++siteEpoch;siteStarting=token;
  try{
    const current=await request('prompt.page.context',{});
    if(token!==siteEpoch)return;
    if(current?.origin!==siteOrigin)throw Error('请切换到 '+siteOrigin+' 的网页');
    const launched=await request('prompt.page.pick.start',{kind});
    const valid=launched?.state==='selecting'&&typeof launched.session==='string'&&
      /^[a-f0-9-]{24,64}$/.test(launched.session);
    if(token!==siteEpoch){
      // Only the immediate cancellation epoch may report this old request's cleanup.
      if(valid&&launched.session!==siteSession)await cancelSiteSession(launched.session,token+1);
      else if(!valid&&siteEpoch===token+1&&!siteSession&&!siteStarting)
        siteMessage('取消选择未确认：网页未返回有效选取会话。网站配置草稿仍保留。',true);
      return;
    }
    if(!valid)throw Error('网页未确认元素选择模式');
    siteSession=launched.session;siteMessage('请在网页中点击目标元素；按 Esc 可以取消。');
    let attempts=0;
    const poll=async()=>{
      if(token!==siteEpoch||!siteSession)return;
      try{
        const result=await request('prompt.page.pick.status',{session:siteSession});
        if(token!==siteEpoch)return;
        if(result?.state==='selected'){
          if(!model.validSelector(result.selector))throw Error('网页返回的选择器不符合规则');
          field.value=result.selector;
          siteSession=null;invalidateSite();
          siteMessage(kind==='editor'?'目标输入框已选取，请测试定位。':'按钮容器已选取，请继续选取输入框。');
          return;
        }
        if(result?.state!=='selecting'||++attempts>=64){
          siteSession=null;siteMessage('选取已取消、过期或网页已经切换。',true);return;
        }
        sitePoll=setTimeout(()=>void poll(),1000);
      }catch(error){
        if(token!==siteEpoch)return;
        siteSession=null;siteMessage('选取中断：'+(error.code||error.message),true);
      }
    };
    sitePoll=setTimeout(()=>void poll(),1000);
  }catch(error){
    if(token===siteEpoch)siteMessage('无法开始选择：'+(error.code||error.message),true);
    else if(siteEpoch===token+1&&!siteSession&&!siteStarting)
      siteMessage('取消选择未确认：'+(error.code||error.message)+'。草稿仍保留，请在网页按 Esc 退出选择。',true);
  }
  finally{if(siteStarting===token)siteStarting=0;}
}
async function testSite(){
  if(!siteOrigin||siteBusy||siteDetecting||siteUnconfirmedWrite||siteSession)return;
  try{
    const epoch=siteEpoch,draftSnapshot=JSON.stringify(siteDraft());
    const rule=model.siteRule(siteDraft());
    siteMessage('正在当前网页验证两个目标…');
    const result=await request('prompt.page.check',{rule});
    if(epoch!==siteEpoch||el('ps-site-form').hidden||JSON.stringify(siteDraft())!==draftSnapshot)return;
    if(result?.valid!==true||result.containerMatches!==1||result.editorMatches!==1||
       !['textarea','input','richtext'].includes(result.editorType))
      throw Error('网页未返回唯一、有效的选择器验证结果');
    siteVerified=JSON.stringify(rule);
    el('ps-site-verified').textContent='验证成功 · '+result.editorType+' · 容器和输入框均唯一匹配';
    siteMessage('定位检查通过；仅表示目标可定位，实际富文本插入仍需真实网站验收。');
  }catch(error){siteVerified=null;siteMessage('测试失败：'+(error.code||error.message),true);}
}
async function saveSite(){
  if(!siteOrigin||siteBusy||siteDetecting||siteUnconfirmedWrite||siteSession)return;
  let rule;
  try{
    rule=model.siteRule(siteDraft());
    if(siteVerified!==JSON.stringify(rule))throw Error('请先测试当前填写的两个选择器');
    if(siteEditing&&!sites.rules.some(row=>siteKey(row)===siteEditing))
      throw Error('旧网站规则已被修改，请重新读取');
    const next={schema:1,rules:siteEditing?
      sites.rules.map(row=>siteKey(row)===siteEditing?rule:row):[...sites.rules,rule]};
    const snapshot=JSON.stringify(siteDraft());
    await commitSites(next);
    // Preserve newer input, and bind it to the acknowledged rule instead of
    // inserting a second rule with the same origin and path.
    if(JSON.stringify(siteDraft())!==snapshot){
      siteEditing=siteKey(rule);siteBaseline=snapshot;siteVerified=null;
      siteDirty=true;siteDiscardPending=false;
      el('ps-site-verified').textContent='保存期间有新的修改，请重新测试后再保存。';
      report();siteMessage('先前版本已保存；新输入仍在表单中，尚未保存。');
      return;
    }
    siteEditing=null;siteOrigin=null;siteVerified=null;siteDirty=false;
    el('ps-site-form').hidden=true;report();siteMessage('网站配置已保存。刷新页面后将自动使用相同规则。');
  }catch(error){siteMessage('保存失败，配置仍保留在表单中：'+(error.code||error.message),true);}
}
async function cancelSiteForm(){
  if(siteBusy||siteUnconfirmedWrite)return;
  if(siteDetecting){++siteEpoch;siteDetecting=false;siteLock();}
  if(siteSession||siteStarting){siteDiscardPending=false;await stopSitePick();return;}
  if(siteDirty&&!siteDiscardPending){
    siteDiscardPending=true;
    siteMessage('存在未保存的网站配置。再次点击「取消」才会放弃；也可以继续编辑。',true);
    return;
  }
  await stopSitePick();siteDirty=false;siteOrigin=null;siteEditing=null;siteVerified=null;
  siteDiscardPending=false;el('ps-site-form').hidden=true;report();siteMessage('');
}
async function toggleSites(){
  if(siteBusy||siteUnconfirmedWrite)return;
  const panel=el('ps-sites-panel'),open=panel.hidden;
  if(!open&&protectSiteDraft())return;
  if(!open)await stopSitePick();
  panel.hidden=!open;el('ps-sites-open').setAttribute('aria-expanded',String(open));
  if(!open){sitesReady=false;return;}
  try{await loadSites();siteMessage('');
    try{
      const context=await request('prompt.page.context',{});
      el('ps-current-site-status').textContent=context?.status==='available'&&context?.origin?
        '当前网站：'+context.origin+(['https://chatgpt.com','https://chat.deepseek.com','https://gemini.google.com'].includes(context.origin)?' · 对话页内置适配':' · 可配置自定义规则'):
        '当前网页不可用；仍可管理已保存的网站规则。';
    }catch{el('ps-current-site-status').textContent='当前网页不可用；仍可管理已保存的网站规则。';}
  }
  catch(error){sitesReady=false;renderSites();siteMessage('网站规则读取失败：'+(error.code||error.message),true);}
}

function render(){
  const list=el('ps-list');list.replaceChildren();
  const enabled=data.items.filter(item=>item.enabled).length;
  el('ps-count').textContent=data.items.length+' 个 · '+enabled+' 个启用';
  el('ps-seed-hint').hidden=!data.items.some(item=>['ps_seed_plugin','ps_seed_outsource','ps_seed_ai_prompt'].includes(item.id));
  el('ps-empty').hidden=data.items.length>0;
  el('ps-web').checked=data.settings.webButtons;
  el('ps-image-size').value=data.settings.imageSize||'large';
   el('ps-image-size-setting').querySelectorAll('[data-image-size]').forEach(button=>{
     const selected=button.dataset.imageSize===el('ps-image-size').value;
      button.setAttribute('aria-pressed',String(selected));
      button.classList.toggle('od-icon-button--primary',selected);
   });
  // Text-only collections keep their original uncluttered list.
  el('ps-image-size-setting').hidden=!data.items.some(item=>item.appearance==='image');
  for(const [i,item] of data.items.entries()){
    const identity=(item.nameAuto?'':item.name?.trim())||
      item.body.trim().replace(/\s+/g,' ').slice(0,60)||'提示词';
    const card=dom('article','ps-card'+(!item.enabled?' is-disabled':''));
    const mainRow=dom('div','ps-card-main');
    const glyph=dom('div','ps-glyph');glyph.setAttribute('aria-hidden','true');
    picture(glyph,item);
    const use=button(mainRow,item.body,()=>void copy(item),'quiet');
    use.replaceChildren(dom('span','ps-card-preview',item.body));
    use.className='ps-card-use od-button od-button--quiet';use.dataset.locked=item.enabled?'0':'1';
    use.setAttribute('aria-label',(item.enabled?'复制完整提示词：':'已停用的提示词：')+identity);
    use.title=item.enabled?'复制完整正文；网页按钮可插入草稿':'已停用，请打开更多操作启用';
    const actions=dom('div','ps-card-actions');
    const more=iconButton(actions,'more','更多操作：'+identity,()=>{
      const opening=expanded!==item.id;expanded=opening?item.id:null;pendingDelete=null;
      render();focusListAction(item.id,opening?'edit':'more');
    },'more',item.id);
    more.setAttribute('aria-expanded',String(expanded===item.id));
    if(expanded===item.id)more.setAttribute('aria-controls','ps-commands-'+i);
    mainRow.prepend(glyph);mainRow.append(actions);card.append(mainRow);
    if(!item.nameAuto&&item.name?.trim())card.append(dom('div','ps-card-caption',item.name));
    if(expanded===item.id){
      const commands=dom('div','ps-more');
      commands.id='ps-commands-'+i;commands.setAttribute('role','group');
      commands.setAttribute('aria-label','提示词操作：'+identity);
      iconButton(commands,'pencil','编辑：'+identity,()=>start(item.id),'edit',item.id);
      iconButton(commands,item.enabled?'eye-off':'eye',(item.enabled?'停用：':'启用：')+identity,
        ()=>void update(item.id,row=>({...row,enabled:!row.enabled}),'toggle'),'toggle',item.id);
      iconButton(commands,'up','上移：'+identity,()=>void move(item.id,-1),'up',item.id,{disabled:i===0});
      iconButton(commands,'down','下移：'+identity,()=>void move(item.id,1),'down',item.id,
        {disabled:i===data.items.length-1});
      iconButton(commands,'copy','复制：'+identity,()=>void copy(item,true),'copy',item.id);
      iconButton(commands,'trash','删除：'+identity,()=>{
        pendingDelete=item.id;render();
        root.querySelector('.ps-delete-cancel')?.focus({preventScroll:true});
      },'delete',item.id,{danger:true});
      card.append(commands);
    }
    if(pendingDelete===item.id){
      const confirm=dom('div','ps-confirm');
      confirm.setAttribute('role','group');confirm.setAttribute('aria-label','删除提示词确认');
      confirm.append(dom('p','','确认删除「'+identity+'」？此操作不能撤销。'));
      const buttons=dom('div','ps-actions');
      const cancel=button(buttons,'取消',()=>{
        pendingDelete=null;render();focusListAction(item.id,'delete');
      });cancel.classList.add('ps-delete-cancel');
      button(buttons,'确认删除',()=>void remove(),'danger');
      confirm.append(buttons);card.append(confirm);
    }
    list.append(card);
  }
  lock();
}

function closeTransfer(){
  const menu=el('ps-transfer-menu');
  menu.hidden=true;el('ps-transfer').setAttribute('aria-expanded','false');
}
function discardImport(){
  importTicket++;stagedImport=null;stagedEtag=null;replaceArmed=false;
  el('ps-import-panel').hidden=true;el('ps-import-warning').hidden=true;
  el('ps-import-replace').textContent='替换现有';report();lock();
}
const sameLibrary=(a,b)=>JSON.stringify(a,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
  ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row)===
  JSON.stringify(b,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
  ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
function importCandidate(mode){
  try{return model.backupPlan(data,stagedImport,mode);}
  catch(e){return {error:e.message,overLimit:true,added:0,skipped:0,bytes:0};}
}
function showImport(){
  if(!stagedImport)return;
  const append=importCandidate('append'),replace=importCandidate('replace');
  el('ps-import-stats').textContent='文件 '+stagedImport.length+' 条 · 可追加 '+append.added+
    ' 条 · 跳过重复 '+append.skipped+' 条';
  el('ps-import-preview').textContent=stagedImport.slice(0,3)
    .map((row,i)=>(i+1)+'. '+row.name).join('\n')+(stagedImport.length>3?'\n…':'');
  el('ps-import-append').disabled=Boolean(append.error||append.overLimit||append.added===0);
  el('ps-import-replace').disabled=Boolean(replace.error||replace.overLimit);
  el('ps-import-append').title=append.error||(append.overLimit?'超过 8 KiB 存储上限':'');
  el('ps-import-replace').title=replace.error||(replace.overLimit?'超过 8 KiB 存储上限':'');
  el('ps-import-panel').hidden=false;
  if(append.error||append.overLimit){
    const reason=append.error||('追加后 '+append.bytes+' / 8192 B，超出容量');
    status('追加导入不可用：'+reason+(replace.error||replace.overLimit?'；替换也不可用。':'；可选择替换。'),true);
  }
  report();lock();
}
async function exportJson(){
  if(!ready||busy||transferBusy||unconfirmedWrite||stagedImport)return;
  closeTransfer();transferBusy=true;lock();
  try{
    const saved=await readLibrary();
    if(saved.etag!==etag){
      data=saved.value;etag=saved.etag;render();
      status('其他窗口修改了提示词库，列表已更新；请重新点击导出。',true);return;
    }
    const exportedAt=new Date().toISOString();
    const text=model.backupExport(saved.value,exportedAt);
    const filename='opendesk-prompt-shortcuts-'+exportedAt.slice(0,10)+'.json';
    const outcome=await request('browser.downloads.text',{text,filename});
    if(outcome?.started!==true)throw Error('Chrome 尚未确认接收下载请求');
    status('Chrome 已受理 JSON 下载，请在下载记录中确认落盘。');
  }catch(e){status('导出未确认：'+(e.code||e.message)+'；请检查下载记录，不会自动重试。',true);}
  finally{transferBusy=false;lock();}
}
async function chooseImportFile(){
  const input=el('ps-import-file'),file=input.files?.[0];
  input.value='';if(!file)return; // Browser file picker cancelled: no side effect.
  if(!ready||busy||transferBusy||unconfirmedWrite)return;
  const ticket=++importTicket;
  transferBusy=true;lock();
  try{
    if(!Number.isSafeInteger(file.size)||file.size<1||file.size>model.BACKUP_MAX_BYTES)
      throw Error('JSON 文件必须为 1 B～256 KiB');
    if(typeof file.text!=='function')throw Error('浏览器不支持读取此本地文件');
    const content=await file.text();
    if(ticket!==importTicket)return;
    const parsed=model.backupParse(content);
    if(ticket!==importTicket)return;
    stagedImport=parsed;stagedEtag=etag;replaceArmed=false;
    el('ps-import-name').textContent=String(file.name||'备份 JSON').slice(0,160);
    el('ps-import-warning').hidden=true;el('ps-import-replace').textContent='替换现有';
    showImport();el('ps-import-append').focus({preventScroll:true});
    status('导入内容已预检查，确认前不会修改已保存的提示词。');
  }catch(e){
    if(ticket===importTicket){discardImport();status('导入预检查失败：'+(e.code||e.message)+'；原有数据未修改。',true);}
  }finally{transferBusy=false;lock();}
}
async function applyImport(mode){
  if(!stagedImport||!ready||busy||transferBusy||unconfirmedWrite)return;
  const candidate=importCandidate(mode);
  if(candidate.error||candidate.overLimit){
    status('不能导入：'+(candidate.error||('超过提示词库 8192 B 存储上限'))+'；原有数据未修改。',true);return;
  }
  if(mode==='append'&&candidate.added===0){
    status('没有新增内容，重复正文已经跳过。');return;
  }
  if(mode==='replace'&&!replaceArmed){
    replaceArmed=true;
    el('ps-import-warning').textContent='将替换现有 '+data.items.length+' 条提示词；再次点击「确认替换」执行。';
    el('ps-import-warning').hidden=false;el('ps-import-replace').textContent='确认替换';
    el('ps-import-replace').focus({preventScroll:true});return;
  }
  transferBusy=true;lock();
  try{
    // Re-read immediately before CAS; never commit against a stale preview.
    const fresh=await readLibrary();
    if(fresh.etag!==etag||fresh.etag!==stagedEtag){
      data=fresh.value;etag=fresh.etag;stagedEtag=etag;replaceArmed=false;
      el('ps-import-warning').hidden=true;el('ps-import-replace').textContent='替换现有';
      render();showImport();
      status('提示词库已经变化，预览已重算；请再次确认，不会自动覆盖。',true);return;
    }
    const planned=model.backupPlan(fresh.value,stagedImport,mode);
    if(planned.overLimit)throw Error('保存容量超过 8192 B');
    // Commit sets busy synchronously and uses Host's existing ETag compare-and-set.
    await commit(planned.next);
    // Save acknowledgement alone is insufficient for a destructive import.
    let checked;
    try{
      checked=await readLibrary();
      if(checked.etag!==etag||!sameLibrary(checked.value,planned.next))
        throw Error('保存后的回读与提交内容不一致');
    }catch(error){
      unconfirmedWrite=true;lock();
      throw Object.assign(Error('保存结果无法完整核实：'+error.message+'；不得重复提交'),{code:'E_OUTCOME_UNKNOWN'});
    }
    data=checked.value;etag=checked.etag;
    discardImport();expanded=null;pendingDelete=null;render();
    status((mode==='replace'?'已替换 ':'已追加 ')+planned.added+' 条，跳过 '+planned.skipped+
      ' 条重复；已核实保存，网页按钮将通过存储事件同步。');
    el('ps-transfer').focus({preventScroll:true});
  }catch(e){
    replaceArmed=false;el('ps-import-warning').hidden=true;
    el('ps-import-replace').textContent='替换现有';
    if(e.code==='E_STORAGE_CONFLICT'){
      try{
        const fresh=await readLibrary();data=fresh.value;etag=fresh.etag;stagedEtag=etag;
        render();showImport();
      }catch{/* Keep staged file without submitting it twice. */}
    }
    status('导入未完成：'+(e.code||e.message)+'。备份内容仍在预览中，请核实后选择重试或取消。',true);
  }finally{transferBusy=false;lock();}
}

async function readLibrary(){
  const saved=await request('storage.get',{key:KEY,withEtag:true});
  if(!/^[0-9a-f]{64}$/.test(saved?.etag||''))throw Error('宿主未提供 ETag 并发保护');
  if(!Object.hasOwn(saved,'value'))throw Error('宿主未提供可核实的存储数据');
  return {value:model.load(saved.value),etag:saved.etag};
}
async function commit(next,analyticsSaveId=null){
  if(unconfirmedWrite)throw Error('上次写入结果未确认，请先保留草稿并重新打开核对');
  if(!ready||busy)throw Error('工具暂不可写入');
  if(model.bytes(next)>8192)throw Object.assign(Error('提示词共用 8 KiB 数据项，超出存储上限'),{code:'E_TOOL_DATA_LIMIT'});
  busy=true;lock();
  try{
    let saved;
    try{
      saved=await request('storage.set',{key:KEY,value:next,ifMatch:etag,
        ...(analyticsSaveId?{analyticsIntent:'save_prompt',itemId:analyticsSaveId}:{})});
      if(saved?.saved!==true||!/^[0-9a-f]{64}$/.test(saved.etag||''))throw Error('没有收到可核实的持久保存结果');
    }catch(e){
      if(['E_STORAGE_CONFLICT','E_TOOL_DATA_LIMIT'].includes(e.code))throw e;
      unconfirmedWrite=true;status('写入回执未确认，正在核对已保存数据…',true);
      try{
        const checked=await readLibrary();
        // Chrome Storage can reorder object keys. Confirm the entire intended library.
        const encode=value=>JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
          ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
        if(encode(checked.value)!==encode(next))throw Error('读回数据与本次写入不一致');
        saved={etag:checked.etag};
      }catch{throw e;}
      unconfirmedWrite=false;
    }
    const staleIds=[...new Set(data.items.map(item=>item.imageAssetId).filter(Boolean))]
      .filter(id=>!next.items.some(item=>item.imageAssetId===id));
    data=next;etag=saved.etag;
    let cleanupFailures=0;
    for(const id of staleIds){
      try{
        const result=await request('prompt.asset.remove',{id});
        if(result?.removed===true)imageAssets.delete(id);
      }catch{cleanupFailures++;}
    }
    return {cleanupFailures};
  }finally{busy=false;lock();}
}
async function update(id,transform,restoreAction='toggle'){
  const row=data.items.find(item=>item.id===id);if(!row||busy||unconfirmedWrite)return;
  const next=model.load({...data,items:data.items.map(item=>item.id===id?transform(item):item)});
  try{await commit(next);render();focusListAction(id,restoreAction);status('设置已保存。');}
  catch(e){status('更新未确认：'+(e.code||e.message)+'；请重新打开核对已保存数据。',true);}
}
async function move(id,step){
  const items=data.items.slice(),i=items.findIndex(row=>row.id===id),j=i+step;
  if(i<0||j<0||j>=items.length||busy||unconfirmedWrite)return;
  [items[i],items[j]]=[items[j],items[i]];
  const next=model.load({...data,items:items.map((row,order)=>({...row,order}))});
  try{await commit(next);render();focusListAction(id,step<0?'up':'down');status('顺序已保存。');}
  catch(e){status('排序未确认：'+(e.code||e.message)+'；请重新打开核对已保存数据。',true);}
}
async function copy(item,allowDisabled=false){
  if(!item.enabled&&!allowDisabled){status('此提示词已停用，可通过编辑重新启用。',true);return;}
  // Synchronous clipboard copy keeps the actual card click user gesture.
  // Never forge a Chrome Host approval or open a second confirmation panel.
  const buffer=el('ps-clipboard-buffer'),doc=root.ownerDocument,focused=doc.activeElement;
  let copied=false;
  try{
    buffer.value=item.body;buffer.focus();buffer.select();
    copied=doc.execCommand?.('copy')===true;
  }catch{/* The modern clipboard API is the next user-gesture attempt. */}
  finally{buffer.value='';focused?.focus?.();}
  if(copied){status('已复制完整正文。');
    void request('analytics.report',{event:'prompt.copied'}).catch(()=>{});return;}
  try{
    if(typeof globalThis.navigator?.clipboard?.writeText!=='function')
      throw Error('当前受限页面不支持直接写入剪贴板');
    await globalThis.navigator.clipboard.writeText(item.body);
    status('已复制完整正文。');
    void request('analytics.report',{event:'prompt.copied'}).catch(()=>{});
  }catch(e){
    status('无法自动复制：'+(e?.message||'剪贴板未授权')+'。请检查浏览器环境后重试。',true);
  }
}
async function save(event,continueCreating=false){
  event?.preventDefault();
  if(mode!=='form'){status('当前不在编辑页面，未执行保存。',true);return;}
  if(!ready){error('宿主存储尚未就绪，未执行保存；草稿保留。');return;}
  if(busy||uploadBusy){error('图片上传或保存尚未确认，请勿重复提交；草稿保留。');return;}
  if(unconfirmedWrite){error('上次写入结果未确认，请保留草稿并重新打开核对。');return;}
  const input=form(),snapshot=JSON.stringify(input),old=editId?data.items.find(row=>row.id===editId):null;
  if(editId&&!old){error('记录已变化，请保留草稿并重新打开');return;}
  let item,next;
  try{
    item=model.draft(input,old);
    next=model.load({...data,items:old?data.items.map(row=>row.id===old.id?item:row):
      [...data.items,{...item,order:data.items.length}]});
    if(model.bytes(next)>8192)throw Error('超过 8 KiB，正文不会静默截断；请调整内容或删除其他条目');
  }catch(e){
    if(!input.body.trim()){bodyError(e.message);el('ps-body').focus();}
    else error(e.message);
    return;
  }
  try{
    error('');status('保存中，请稍候…');
    const outcome=await commit(next,item.id);
    // The user may keep typing during the request. Future saves must edit this
    // acknowledged item, including when the original request created it.
    editId=item.id;el('ps-form-title').textContent='编辑提示词';
    if(snapshot===JSON.stringify(form())){
      if(continueCreating&&!old){start();status('已保存，可继续新建。');}
      else{index();status(outcome.cleanupFailures?
      '提示词已保存，旧图片清理未确认；可重新打开核对。':'完整提示词已保存。',
      Boolean(outcome.cleanupFailures));}
    }
    else{baseline=snapshot;changed();publishNavigation();status('先前版本已保存，当前新输入尚未保存。');
      error('保存期间有新的输入，先前版本已保存；请再次点击保存。');}
  }catch(e){
    dirty=true;lock();status('');error((e.code||'E_SAVE')+'：'+e.message+
      '。草稿保留；如写入结果未知，请先复制草稿并重开核对，不直接覆盖。');
  }
}
async function remove(){
  if(!pendingDelete||busy||unconfirmedWrite)return;
  const deletedIndex=data.items.findIndex(item=>item.id===pendingDelete);
  const next=model.load({...data,items:data.items.filter(item=>item.id!==pendingDelete)
    .map((item,order)=>({...item,order}))});
  try{const outcome=await commit(next);pendingDelete=null;expanded=null;
    render();
    const survivor=data.items[Math.min(deletedIndex,data.items.length-1)];
    if(survivor)focusListAction(survivor.id,'more');else el('ps-new').focus({preventScroll:true});
    status(outcome.cleanupFailures?
      '提示词已删除，但旧图片清理未确认；请留意本地图片容量。':'提示词已删除。',
      Boolean(outcome.cleanupFailures));}
  catch(e){status('删除未确认，显示上次确认的列表：'+(e.code||e.message)+'；请重新打开核对已保存数据。',true);}
}
async function changeWeb(){
  if(!ready||busy||unconfirmedWrite)return;
  const desired=el('ps-web').checked;
  const next=model.load({...data,settings:{...data.settings,webButtons:desired}});
  try{await commit(next);render();status(desired?'网页快捷按钮已开启。':'网页快捷按钮已关闭，提示词仍保留。');}
  catch(e){render();status('网页按钮设置未确认，当前显示上次确认状态：'+(e.code||e.message)+'；请重新打开核对。',true);}
}
async function changeImageSize(){
  const control=el('ps-image-size');
  if(!ready||busy||transferBusy||stagedImport||unconfirmedWrite){render();return;}
  const desired=control.value;
  if(!Object.hasOwn(model.IMAGE_SIZES,desired)){render();return;}
  if(desired===data.settings.imageSize)return;
  const next=model.load({...data,settings:{...data.settings,imageSize:desired}});
  try{
    await commit(next);
    render();
    status('图片尺寸已保存，网页按钮将同步更新。');
  }catch(e){
    // Preserve the last confirmed state, never turn a failed size change into a local-only illusion.
    render();
    status('图片尺寸未保存：'+(e.code||e.message)+'；请重新打开核对。',true);
  }
}

async function launch(){
  try{
    const value=await OpenDeskSDK.browser.launch.consume();
    if(mode==='index'&&!dirty&&!busy&&!unconfirmedWrite&&
      value?.toolId==='prompt-shortcuts'&&value.actionId===MENU_ACTION&&
      typeof value.selection==='string'&&value.selection.trim())start(null,value.selection);
  }catch{/* An ordinary opening does not carry a one-use native menu ticket. */}
}
el('ps-new').append(icon('plus'));
el('ps-transfer').append(icon('transfer'));
el('ps-export').prepend(icon('export'));el('ps-import').prepend(icon('import'));
el('ps-transfer').addEventListener('click',()=>{
  if(!ready||busy||transferBusy||unconfirmedWrite)return;
  const next=el('ps-transfer-menu').hidden;
  closeTransfer();el('ps-transfer-menu').hidden=!next;
  el('ps-transfer').setAttribute('aria-expanded',String(next));
  if(next)el('ps-export').focus({preventScroll:true});
});
el('ps-export').addEventListener('click',()=>void exportJson());
el('ps-import').addEventListener('click',()=>{
  closeTransfer();
  if(!ready||busy||transferBusy||unconfirmedWrite)return;
  el('ps-import-file').click();
});
el('ps-import-file').addEventListener('change',()=>void chooseImportFile());
el('ps-import-cancel').addEventListener('click',()=>{discardImport();el('ps-transfer').focus({preventScroll:true});});
el('ps-import-append').addEventListener('click',()=>void applyImport('append'));
el('ps-import-replace').addEventListener('click',()=>void applyImport('replace'));
root.addEventListener('click',event=>{
  if(!el('ps-transfer-control').contains?.(event.target))closeTransfer();
});
el('ps-new').addEventListener('click',()=>start());
// Back and primary are existing instance-gated bridge gestures, never a second router.
root.addEventListener('opendesk-tool-navigation',event=>{
  if(event.detail?.action==='back'&&mode==='form')back();
  else if(event.detail?.action==='primary'&&mode==='index')start();
});
root.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(pendingDelete){const id=pendingDelete;pendingDelete=null;render();focusListAction(id,'delete');event.preventDefault();}
  else if(expanded){const id=expanded;expanded=null;render();focusListAction(id,'more');event.preventDefault();}
  else if(!el('ps-transfer-menu').hidden){closeTransfer();el('ps-transfer').focus({preventScroll:true});event.preventDefault();}
  else if(stagedImport&&!busy&&!transferBusy){discardImport();el('ps-transfer').focus({preventScroll:true});event.preventDefault();}
});
// The sandbox intentionally disallows forms. Native button activation must
// save directly, without relying on the browser dispatching a submit event.
el('ps-save').addEventListener('click',e=>void save(e));
el('ps-save-next').addEventListener('click',e=>void save(e,true));
el('ps-form').addEventListener('submit',e=>void save(e));
el('ps-form').addEventListener('keydown',e=>{
  if(e.key!=='Enter'||e.isComposing||e.keyCode===229||e.repeat||e.defaultPrevented)return;
  if(e.target!==el('ps-label')&&e.target!==el('ps-name'))return;
  e.preventDefault();void save();
});
el('ps-form').addEventListener('input',changed);el('ps-form').addEventListener('change',changed);
el('ps-image-pick').addEventListener('click',()=>{
  if(mode==='form'&&!uploadBusy&&!busy)el('ps-image-file').click();
});
el('ps-image-file').addEventListener('change',()=>void uploadImage());
el('ps-image-clear').addEventListener('click',()=>{
  if(mode!=='form'||uploadBusy||busy)return;
  const previous=draftImageAssetId;draftImageAssetId='';changed();
  el('ps-image-help').textContent='本地图片已从草稿移除；请选择新图片或切换外观。';
  if(previous&&!data.items.some(row=>row.imageAssetId===previous))
    removeUnreferencedAsset(previous);
});
el('ps-cancel').addEventListener('click',()=>back());
el('ps-stay').addEventListener('click',()=>{el('ps-leave').hidden=true;pendingLeave=null;el('ps-body').focus();});
el('ps-discard').addEventListener('click',()=>{if(busy)return;const action=pendingLeave;pendingLeave=null;if(action)action();});
el('ps-toggle-settings').addEventListener('click',()=>options(el('ps-setting-fields').hidden));
el('ps-web').addEventListener('change',()=>void changeWeb());
el('ps-image-size-setting').querySelectorAll('[data-image-size]').forEach(button=>
   button.addEventListener('click',()=>{
     el('ps-image-size').value=button.dataset.imageSize;
     void changeImageSize();
   }));
el('ps-sites-panel').hidden=true;el('ps-site-form').hidden=true;
el('ps-sites-open').addEventListener('click',()=>void toggleSites());
el('ps-site-current').addEventListener('click',()=>void openCurrentSite());
el('ps-site-container').addEventListener('input',invalidateSite);
el('ps-site-editor').addEventListener('input',invalidateSite);
el('ps-site-path').addEventListener('input',invalidateSite);
el('ps-site-enabled').addEventListener('change',invalidateSite);
el('ps-pick-container').addEventListener('click',()=>void pickSite('container'));
el('ps-pick-editor').addEventListener('click',()=>void pickSite('editor'));
el('ps-site-test').addEventListener('click',()=>void testSite());
el('ps-site-auto').addEventListener('click',()=>void autoLocateSite());
el('ps-site-save').addEventListener('click',()=>void saveSite());
el('ps-site-cancel').addEventListener('click',()=>void cancelSiteForm());

(async()=>{
  lock();
  try{
    const saved=await readLibrary();
    data=saved.value;etag=saved.etag;
    await hydrateImageAssets(data.items);
    ready=true;index();status('');
    await launch();
  }catch(e){ready=false;lock();status('数据读取失败，已阻止写入以保护本机数据：'+e.message,true);}
})();
})();
