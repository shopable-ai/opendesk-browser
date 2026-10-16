(() => {
'use strict';
const {root,request,setState}=globalThis.OpenDeskTool;
const model=globalThis.OpenDeskPromptShortcutsModel,el=id=>root.querySelector('#'+id);
const dom=(tag,cls='',text='')=>{const n=root.ownerDocument.createElement(tag);n.className=cls;n.textContent=text;return n;};
const KEY='library',MENU_ACTION='add-selection';
let data=model.defaults(),etag=null,ready=false,busy=false,dirty=false,mode='index',editId=null;
let baseline='',expanded=null,pendingDelete=null,pendingLeave=null,unconfirmedWrite=false;
const SITE_KEY='sites';
let sites=model.sitesDefaults(),sitesEtag=null,sitesReady=false,siteBusy=false,siteDirty=false;
let siteOrigin=null,siteEditing=null,siteBaseline='',siteVerified=null,siteDelete=null;
let sitePoll=0,siteSession=null,siteEpoch=0,siteDiscardPending=false;
function report(){setState({dirty:dirty||siteDirty,busy:busy||siteBusy});}
function status(message='',isError=false){const n=el('ps-status');n.textContent=message;n.hidden=!message;n.dataset.error=String(isError);}
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
  return {body:el('ps-body').value,label:el('ps-label').value,name:el('ps-name').value,
    shape:previous?.shape==='round'?'round':'square',enabled:el('ps-enabled').checked};
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
function preview(){
  const draft=form(),fallback=model.auto(draft.body),label=draft.label.trim()||fallback;
  const glyph=el('ps-preview-glyph');
  glyph.replaceChildren(...model.parts(label||'—').map(char=>dom('span','',char)));
  el('ps-preview-name').textContent=draft.name.trim()||fallback||'待生成';
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
  for(const id of ['ps-new','ps-save','ps-save-next','ps-web'])
    el(id).disabled=!ready||busy||unconfirmedWrite;
  for(const id of ['ps-cancel','ps-discard'])el(id).disabled=busy;
  el('ps-form').setAttribute('aria-busy',String(busy));
  el('ps-save').textContent=busy?'保存中…':'保存';
  el('ps-save-next').textContent=busy?'保存中…':'保存并继续';
  for(const b of el('ps-list').querySelectorAll('button'))b.disabled=!ready||busy||unconfirmedWrite||b.dataset.locked==='1';
  report();
}
function index(){
  mode='index';editId=null;dirty=false;pendingLeave=null;pendingDelete=null;
  el('ps-index').hidden=false;el('ps-edit').hidden=true;el('ps-leave').hidden=true;
  error('');bodyError('');render();report();
}
function back(callback=index){
  if(busy)return;
  if(!dirty){callback();return;}
  pendingLeave=callback;el('ps-leave').hidden=false;el('ps-stay').focus();
}
function start(id=null,preset=''){
  if(!ready||busy||unconfirmedWrite)return;
  const row=id?data.items.find(item=>item.id===id):null;
  if(id&&!row){status('原条目已变化，请重新打开工具核对。',true);return;}
  mode='form';editId=id;expanded=null;pendingDelete=null;
  el('ps-index').hidden=true;el('ps-edit').hidden=false;
  el('ps-save-next').hidden=Boolean(id);
  el('ps-form-title').textContent=id?'编辑提示词':'新建提示词';
  el('ps-body').value=row?.body??preset;
  el('ps-label').value=row&&!row.labelAuto?row.label:'';
  el('ps-name').value=row&&!row.nameAuto?row.name:'';
  el('ps-enabled').checked=row?.enabled!==false;error('');bodyError('');options(true);el('ps-leave').hidden=true;
  // A native-menu selection is an unsaved new draft, never an acknowledged baseline.
  baseline=JSON.stringify({...form(),body:row?.body??''});changed();el('ps-body').focus();
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
  'chevron-down':['M6 9l6 6 6-6']
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
  const b=dom('button','ps-icon-button'+(danger?' ps-icon-button--danger':''));
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
  if(!sitesReady||siteBusy||!sitesEtag)throw Error('网站规则尚未就绪');
  const normalized=model.sitesLoad(next);
  if(model.bytes(normalized)>8192)throw Error('网站适配规则超出 8 KiB');
  siteBusy=true;report();
  try{
    let reply;
    try{
      reply=await request('storage.set',{key:SITE_KEY,value:normalized,ifMatch:sitesEtag});
      if(reply?.saved!==true||!/^[a-f0-9]{64}$/.test(reply.etag||''))
        throw Error('保存回执不完整');
    }catch(error){
      if(['E_STORAGE_CONFLICT','E_TOOL_DATA_LIMIT'].includes(error?.code))throw error;
      // Unknown outcome: read back the exact canonical rule set before success.
      const checked=await readSites();
      if(JSON.stringify(checked.data)!==JSON.stringify(normalized))
        throw Object.assign(Error('保存结果未知；不要再次覆盖，请重新打开核对'),{code:'E_OUTCOME_UNKNOWN'});
      reply={etag:checked.etag};
    }
    sites=normalized;sitesEtag=reply.etag;renderSites();
  }finally{siteBusy=false;report();}
}
function renderSites(){
  const host=el('ps-sites-list');host.replaceChildren();
  if(!sitesReady){host.append(dom('p','ps-hint','网站规则未加载。'));return;}
  if(!sites.rules.length)host.append(dom('p','ps-hint','目前仅启用内置 ChatGPT。'));
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
}
function openSiteForm(rule){
  if(siteBusy)return;
  ++siteEpoch;siteSession=null;siteVerified=null;siteDiscardPending=false;
  siteEditing=rule?siteKey(rule):null;siteOrigin=rule?.origin||null;
  el('ps-site-form').hidden=false;
  el('ps-site-container').value=rule?.containerSelector||'';
  el('ps-site-editor').value=rule?.editorSelector||'';
  el('ps-site-path').value=rule?.pathScope||'/';
  el('ps-site-enabled').checked=rule?.enabled!==false;
  el('ps-site-origin').textContent=siteOrigin||'请选择当前网站';
  el('ps-site-form-title').textContent=rule?'编辑网站规则':'配置当前网站';
  el('ps-site-verified').textContent='保存前请在该网站测试定位。';
  siteBaseline=JSON.stringify(siteDraft());siteDirty=false;report();
  el('ps-site-container').focus();
}


async function openCurrentSite(){
  if(!sitesReady||siteBusy)return;
  if(siteDirty){siteMessage('请先保存或取消当前未保存的网站配置。',true);return;}
  try{
    const context=await request('prompt.page.context',{});
    if(context?.status!=='available'||!context.origin)throw Error('请先打开普通网页');
    if(context.origin==='https://chatgpt.com')throw Error('ChatGPT 已内置，无需重新配置');
    const matching=sites.rules.filter(rule=>rule.origin===context.origin&&
      (rule.pathScope==='/'||context.path===rule.pathScope||
      context.path.startsWith(rule.pathScope.endsWith('/')?rule.pathScope:rule.pathScope+'/')))
      .sort((a,b)=>b.pathScope.length-a.pathScope.length)[0];
    if(matching){openSiteForm(matching);return;}
    openSiteForm(null);siteOrigin=context.origin;
    el('ps-site-origin').textContent=context.origin;
    siteBaseline=JSON.stringify(siteDraft());siteDirty=false;report();
    siteMessage('请在网页上选择两个目标，然后测试并保存。');
  }catch(error){siteMessage(error.code||error.message,true);}
}
async function stopSitePick(){
  ++siteEpoch;clearTimeout(sitePoll);sitePoll=0;
  const session=siteSession;siteSession=null;
  if(session)try{await request('prompt.page.pick.cancel',{session});}catch{}
}
async function pickSite(kind){
  if(!siteOrigin||siteBusy||siteSession)return;
  const field=el(kind==='editor'?'ps-site-editor':'ps-site-container');
  const token=++siteEpoch;
  try{
    const current=await request('prompt.page.context',{});
    if(token!==siteEpoch)return;
    if(current?.origin!==siteOrigin)throw Error('请切换到 '+siteOrigin+' 的网页');
    const launched=await request('prompt.page.pick.start',{kind});
    if(token!==siteEpoch)return;
    if(launched?.state!=='selecting'||typeof launched.session!=='string')
      throw Error('网页未确认元素选择模式');
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
  }catch(error){if(token===siteEpoch)siteMessage('无法开始选择：'+(error.code||error.message),true);}
}
async function testSite(){
  if(!siteOrigin||siteBusy||siteSession)return;
  try{
    const rule=model.siteRule(siteDraft());
    siteMessage('正在当前网页验证两个目标…');
    const result=await request('prompt.page.check',{rule});
    if(result?.valid!==true||result.containerMatches!==1||result.editorMatches!==1||
       !['textarea','input','richtext'].includes(result.editorType))
      throw Error('网页未返回唯一、有效的选择器验证结果');
    siteVerified=JSON.stringify(rule);
    el('ps-site-verified').textContent='验证成功 · '+result.editorType+' · 容器和输入框均唯一匹配';
    siteMessage('定位检查通过；仅表示目标可定位，实际富文本插入仍需真实网站验收。');
  }catch(error){siteVerified=null;siteMessage('测试失败：'+(error.code||error.message),true);}
}
async function saveSite(){
  if(!siteOrigin||siteBusy||siteSession)return;
  let rule;
  try{
    rule=model.siteRule(siteDraft());
    if(siteVerified!==JSON.stringify(rule))throw Error('请先测试当前填写的两个选择器');
    if(siteEditing&&!sites.rules.some(row=>siteKey(row)===siteEditing))
      throw Error('旧网站规则已被修改，请重新读取');
    const next={schema:1,rules:siteEditing?
      sites.rules.map(row=>siteKey(row)===siteEditing?rule:row):[...sites.rules,rule]};
    await commitSites(next);
    siteEditing=null;siteOrigin=null;siteVerified=null;siteDirty=false;
    el('ps-site-form').hidden=true;report();siteMessage('网站配置已保存。刷新页面后将自动使用相同规则。');
  }catch(error){siteMessage('保存失败，配置仍保留在表单中：'+(error.code||error.message),true);}
}
async function cancelSiteForm(){
  if(siteDirty&&!siteDiscardPending){
    siteDiscardPending=true;
    siteMessage('存在未保存的网站配置。再次点击「取消」才会放弃；也可以继续编辑。',true);
    return;
  }
  await stopSitePick();siteDirty=false;siteOrigin=null;siteEditing=null;siteVerified=null;
  siteDiscardPending=false;el('ps-site-form').hidden=true;report();siteMessage('');
}
async function toggleSites(){
  const panel=el('ps-sites-panel'),open=panel.hidden;
  if(!open&&siteDirty){siteMessage('请先保存或明确取消未保存的网站配置。',true);return;}
  if(!open)await stopSitePick();
  panel.hidden=!open;el('ps-sites-open').setAttribute('aria-expanded',String(open));
  if(!open){sitesReady=false;return;}
  try{await loadSites();siteMessage('');}
  catch(error){sitesReady=false;renderSites();siteMessage('网站规则读取失败：'+(error.code||error.message),true);}
}

function render(){
  const list=el('ps-list');list.replaceChildren();
  const enabled=data.items.filter(item=>item.enabled).length;
  el('ps-count').textContent=data.items.length+' 个 · '+enabled+' 个启用';
  el('ps-empty').hidden=data.items.length>0;
  el('ps-web').checked=data.settings.webButtons;
  for(const [i,item] of data.items.entries()){
    const identity=(item.nameAuto?'':item.name?.trim())||
      item.body.trim().replace(/\s+/g,' ').slice(0,60)||'提示词';
    const card=dom('article','ps-card'+(!item.enabled?' is-disabled':''));
    const mainRow=dom('div','ps-card-main');
    const glyph=dom('div','ps-glyph');glyph.setAttribute('aria-hidden','true');
    for(const char of model.parts(item.label))glyph.append(dom('span','',char));
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
    if(expanded===item.id)more.setAttribute('aria-controls','ps-menu-'+i);
    mainRow.prepend(glyph);mainRow.append(actions);card.append(mainRow);
    if(!item.nameAuto&&item.name?.trim())card.append(dom('div','ps-card-caption',item.name));
    if(expanded===item.id){
      const commands=dom('div','ps-more');
      commands.id='ps-menu-'+i;commands.setAttribute('role','group');
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
async function readLibrary(){
  const saved=await request('storage.get',{key:KEY,withEtag:true});
  if(!/^[0-9a-f]{64}$/.test(saved?.etag||''))throw Error('宿主未提供 ETag 并发保护');
  if(!Object.hasOwn(saved,'value'))throw Error('宿主未提供可核实的存储数据');
  return {value:model.load(saved.value),etag:saved.etag};
}
async function commit(next){
  if(unconfirmedWrite)throw Error('上次写入结果未确认，请先保留草稿并重新打开核对');
  if(!ready||busy)throw Error('工具暂不可写入');
  if(model.bytes(next)>8192)throw Object.assign(Error('提示词共用 8 KiB 数据项，超出存储上限'),{code:'E_TOOL_DATA_LIMIT'});
  busy=true;lock();
  try{
    let saved;
    try{
      saved=await request('storage.set',{key:KEY,value:next,ifMatch:etag});
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
    data=next;etag=saved.etag;
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
  if(copied){status('已复制完整正文。');return;}
  try{
    if(typeof globalThis.navigator?.clipboard?.writeText!=='function')
      throw Error('当前受限页面不支持直接写入剪贴板');
    await globalThis.navigator.clipboard.writeText(item.body);
    status('已复制完整正文。');
  }catch(e){
    status('无法自动复制：'+(e?.message||'剪贴板未授权')+'。请检查浏览器环境后重试。',true);
  }
}
async function save(event,continueCreating=false){
  event?.preventDefault();
  if(mode!=='form'){status('当前不在编辑页面，未执行保存。',true);return;}
  if(!ready){error('宿主存储尚未就绪，未执行保存；草稿保留。');return;}
  if(busy){error('上一笔保存尚未确认，请勿重复提交；草稿保留。');return;}
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
    await commit(next);
    // The user may keep typing during the request. Future saves must edit this
    // acknowledged item, including when the original request created it.
    editId=item.id;el('ps-form-title').textContent='编辑提示词';
    if(snapshot===JSON.stringify(form())){
      if(continueCreating&&!old){start();status('已保存，可继续新建。');}
      else{index();status('完整提示词已保存。');}
    }
    else{baseline=snapshot;changed();status('先前版本已保存，当前新输入尚未保存。');
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
  try{await commit(next);pendingDelete=null;expanded=null;
    render();
    const survivor=data.items[Math.min(deletedIndex,data.items.length-1)];
    if(survivor)focusListAction(survivor.id,'more');else el('ps-new').focus({preventScroll:true});
    status('提示词已删除。');}
  catch(e){status('删除未确认，显示上次确认的列表：'+(e.code||e.message)+'；请重新打开核对已保存数据。',true);}
}
async function changeWeb(){
  if(!ready||busy||unconfirmedWrite)return;
  const desired=el('ps-web').checked;
  const next=model.load({...data,settings:{webButtons:desired}});
  try{await commit(next);render();status(desired?'ChatGPT 快捷按钮已开启。':'ChatGPT 快捷按钮已关闭，提示词仍保留。');}
  catch(e){render();status('网页按钮设置未确认，当前显示上次确认状态：'+(e.code||e.message)+'；请重新打开核对。',true);}
}
async function launch(){
  try{
    const value=await OpenDeskSDK.browser.launch.consume();
    if(value?.toolId==='prompt-shortcuts'&&value.actionId===MENU_ACTION&&
      typeof value.selection==='string'&&value.selection.trim())start(null,value.selection);
  }catch{/* An ordinary opening does not carry a one-use native menu ticket. */}
}
el('ps-new').append(icon('plus'));
el('ps-new').addEventListener('click',()=>start());
root.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(pendingDelete){const id=pendingDelete;pendingDelete=null;render();focusListAction(id,'delete');event.preventDefault();}
  else if(expanded){const id=expanded;expanded=null;render();focusListAction(id,'more');event.preventDefault();}
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
el('ps-cancel').addEventListener('click',()=>back());
el('ps-stay').addEventListener('click',()=>{el('ps-leave').hidden=true;pendingLeave=null;el('ps-body').focus();});
el('ps-discard').addEventListener('click',()=>{if(busy)return;const action=pendingLeave;pendingLeave=null;if(action)action();});
el('ps-toggle-settings').addEventListener('click',()=>options(el('ps-setting-fields').hidden));
el('ps-web').addEventListener('change',()=>void changeWeb());
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
el('ps-site-save').addEventListener('click',()=>void saveSite());
el('ps-site-cancel').addEventListener('click',()=>void cancelSiteForm());

(async()=>{
  lock();
  try{
    const saved=await readLibrary();
    data=saved.value;etag=saved.etag;ready=true;index();status('');
    await launch();
  }catch(e){ready=false;lock();status('数据读取失败，已阻止写入以保护本机数据：'+e.message,true);}
})();
})();
