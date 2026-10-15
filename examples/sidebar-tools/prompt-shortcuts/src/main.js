(() => {
'use strict';
const {root,request,setState}=globalThis.OpenDeskTool;
const model=globalThis.OpenDeskPromptShortcutsModel,el=id=>root.querySelector('#'+id);
const dom=(tag,cls='',text='')=>{const n=root.ownerDocument.createElement(tag);n.className=cls;n.textContent=text;return n;};
const KEY='library',MENU_ACTION='add-selection';
let data=model.defaults(),etag=null,ready=false,busy=false,dirty=false,mode='index',editId=null;
let baseline='',expanded=null,pendingDelete=null,pendingLeave=null,menuStatus=null;
function report(){setState({dirty,busy});}
function status(message='',error=false){el('ps-status').textContent=message;el('ps-status').dataset.error=String(error);}
function error(message=''){el('ps-error').textContent=message;el('ps-error').hidden=!message;}
function form(){return {body:el('ps-body').value,label:el('ps-label').value,name:el('ps-name').value,
  shape:root.querySelector('input[name="ps-shape"]:checked')?.value||'square',enabled:el('ps-enabled').checked};}
function preview(){
  const draft=form(),fallback=model.auto(draft.body);
  el('ps-preview').textContent='按钮：'+(draft.label.trim()||fallback||'—')+'　名称：'+(draft.name.trim()||fallback||'—');
}
function changed(){
  if(mode!=='form')return;
  dirty=JSON.stringify(form())!==baseline;preview();report();
}
function lock(){
  for(const id of ['ps-new','ps-save','ps-web','ps-menu','ps-delete-yes'])
    el(id).disabled=!ready||busy;
  for(const b of el('ps-list').querySelectorAll('button'))b.disabled=!ready||busy||b.dataset.locked==='1';
  report();
}
function index(){
  mode='index';editId=null;dirty=false;pendingLeave=null;pendingDelete=null;
  el('ps-index').hidden=false;el('ps-edit').hidden=true;el('ps-leave').hidden=true;
  el('ps-delete').hidden=true;error('');render();report();
}
function back(callback=index){
  if(!dirty){callback();return;}
  pendingLeave=callback;el('ps-leave').hidden=false;el('ps-stay').focus();
}
function start(id=null,preset=''){
  if(!ready||busy)return;
  const row=id?data.items.find(item=>item.id===id):null;
  if(id&&!row){status('原条目已变化，请重新打开工具核对。',true);return;}
  mode='form';editId=id;el('ps-index').hidden=true;el('ps-edit').hidden=false;
  el('ps-form-title').textContent=id?'编辑提示词':'新建提示词';
  el('ps-body').value=row?.body??preset;
  el('ps-label').value=row&&!row.labelAuto?row.label:'';
  el('ps-name').value=row&&!row.nameAuto?row.name:'';
  root.querySelector('input[name="ps-shape"][value="'+(row?.shape||'square')+'"]').checked=true;
  el('ps-enabled').checked=row?.enabled!==false;error('');el('ps-leave').hidden=true;
  baseline=JSON.stringify(form());dirty=false;preview();report();el('ps-body').focus();
}
function button(parent,text,callback,variant='secondary'){
  const b=dom('button','od-button od-button--'+variant,text);b.type='button';
  b.addEventListener('click',callback);parent.append(b);return b;
}
function render(){
  const list=el('ps-list');list.replaceChildren();
  el('ps-count').textContent=data.items.length+' 个快捷按钮';
  el('ps-empty').hidden=data.items.length>0;el('ps-web').checked=data.settings.webButtons;
  el('ps-menu').checked=Boolean(menuStatus?.enabled);
  el('ps-grant').textContent='网页按钮必须在工具详情「设置」授权 chatgpt.com。'+
    (menuStatus?.enabled?' 当前网站右键快捷添加已启用。':' 原生右键菜单需另行在工具详情启用。');
  for(const [i,item] of data.items.entries()){
    const card=dom('article','ps-card'),head=dom('div','ps-card-main');
    const icon=dom('div','ps-glyph'+(item.shape==='round'?' round':''));
    for(const p of model.parts(item.label))icon.append(dom('span','',p));
    const desc=dom('div','ps-info');desc.append(dom('strong','',item.name+(item.enabled?'':' · 已停用')),
      dom('p','',item.body.replace(/\s+/gu,' ').slice(0,100)));
    const actions=dom('div','ps-actions');
    button(actions,'编辑',()=>start(item.id));
    button(actions,expanded===item.id?'收起':'更多',()=>{expanded=expanded===item.id?null:item.id;render();});
    head.append(icon,desc,actions);card.append(head);
    if(expanded===item.id){
      const more=dom('div','ps-actions ps-more');
      button(more,item.enabled?'停用':'启用',()=>void update(item.id,row=>({...row,enabled:!row.enabled})));
      const up=button(more,'上移',()=>void move(item.id,-1));up.dataset.locked=i===0?'1':'0';
      const down=button(more,'下移',()=>void move(item.id,1));down.dataset.locked=i===data.items.length-1?'1':'0';
      button(more,'复制',()=>void copy(item));
      button(more,'删除',()=>{pendingDelete=item.id;el('ps-delete-name').textContent=item.name+' · 此操作无法撤销';
        el('ps-delete').hidden=false;el('ps-delete-cancel').focus();},'danger');
      card.append(more);
    }
    list.append(card);
  }
  lock();
}
async function commit(next){
  if(!ready||busy)throw Error('工具暂不可写入');
  if(model.bytes(next)>8192)throw Object.assign(Error('提示词共用 8 KiB 数据项，超出存储上限'),{code:'E_TOOL_DATA_LIMIT'});
  busy=true;lock();
  try{
    const saved=await request('storage.set',{key:KEY,value:next,ifMatch:etag});
    if(saved?.saved!==true||!/^[0-9a-f]{64}$/.test(saved.etag||''))throw Error('没有收到可核实的持久保存结果');
    data=next;etag=saved.etag;
  }finally{busy=false;lock();}
}
async function update(id,transform){
  const row=data.items.find(item=>item.id===id);if(!row||busy)return;
  const next=model.load({...data,items:data.items.map(item=>item.id===id?transform(item):item)});
  try{await commit(next);render();status('设置已保存。');}
  catch(e){status('没有更新原数据：'+(e.code||e.message)+'；请核对后重试。',true);}
}
async function move(id,step){
  const items=data.items.slice(),i=items.findIndex(row=>row.id===id),j=i+step;
  if(i<0||j<0||j>=items.length||busy)return;
  [items[i],items[j]]=[items[j],items[i]];
  const next=model.load({...data,items:items.map((row,order)=>({...row,order}))});
  try{await commit(next);render();status('顺序已保存。');}
  catch(e){status('排序未确认：'+(e.code||e.message),true);}
}
async function copy(item){
  try{
    const result=await request('clipboard.writeText',{text:item.body});
    if(result?.copied!==true)throw Error('未确认剪贴板结果');
    status('已复制完整正文。');
  }catch{
    el('ps-copy-text').value=item.body;el('ps-copy').hidden=false;
    el('ps-copy-text').focus();el('ps-copy-text').select();status('剪贴板暂不可用，请手动复制完整正文。',true);
  }
}
async function save(event){
  event.preventDefault();if(!ready||busy||mode!=='form')return;
  const input=form(),snapshot=JSON.stringify(input),old=editId?data.items.find(row=>row.id===editId):null;
  if(editId&&!old){error('记录已变化，请保留草稿并重新打开');return;}
  let item,next;
  try{
    item=model.draft(input,old);
    next=model.load({...data,items:old?data.items.map(row=>row.id===old.id?item:row):
      [...data.items,{...item,order:data.items.length}]});
    if(model.bytes(next)>8192)throw Error('超过 8 KiB，正文不会静默截断；请调整内容或删除其他条目');
  }catch(e){error(e.message);return;}
  try{
    await commit(next);
    if(snapshot===JSON.stringify(form())){index();status('完整提示词已保存。');}
    else{baseline=snapshot;changed();error('保存期间有新的输入，先前版本已保存；请再次点击保存。');}
  }catch(e){dirty=true;report();error((e.code||'E_SAVE')+'：'+e.message+
    '。草稿保留；如写入结果未知，请先重开核对，不直接覆盖。');}
}
async function remove(){
  if(!pendingDelete||busy)return;
  const next=model.load({...data,items:data.items.filter(item=>item.id!==pendingDelete)
    .map((item,order)=>({...item,order}))});
  try{await commit(next);pendingDelete=null;expanded=null;el('ps-delete').hidden=true;
    render();status('提示词已删除。');}
  catch(e){status('删除未确认，原列表保留：'+(e.code||e.message),true);}
}
async function changeWeb(){
  if(!ready||busy)return;
  const desired=el('ps-web').checked;
  const next=model.load({...data,settings:{webButtons:desired}});
  try{await commit(next);render();status(desired?'网页按钮已开启，仍需独立网站授权。':'网页按钮已关闭，右键菜单不受影响。');}
  catch(e){render();status('网页按钮设置未确认：'+(e.code||e.message),true);}
}
async function menuRefresh(){
  try{menuStatus=await OpenDeskSDK.browser.contextMenu.getStatus();}
  catch{menuStatus=null;}
  if(mode==='index')render();
}
async function changeMenu(){
  if(!ready||busy)return;
  const desired=el('ps-menu').checked;el('ps-menu').disabled=true;
  try{
    if(desired){
      const current=await OpenDeskSDK.browser.contextMenu.getStatus();
      if(!current?.browserPermission||!current.approvedOrigins?.includes('https://chatgpt.com'))
        throw Error('请先在 OpenDesk 工具详情为当前 ChatGPT 网站启用原生菜单权限');
      await OpenDeskSDK.browser.contextMenu.register({actionIds:[MENU_ACTION]});
    }else await OpenDeskSDK.browser.contextMenu.unregister();
    await menuRefresh();status(desired?'原生右键快捷添加已开启。':'原生右键快捷添加已关闭。');
  }catch(e){await menuRefresh();status('右键设置未确认：'+(e.code||e.message),true);}
}
async function launch(){
  try{
    const value=await OpenDeskSDK.browser.launch.consume();
    if(value?.toolId==='prompt-shortcuts'&&value.actionId===MENU_ACTION&&
      typeof value.selection==='string'&&value.selection.trim())start(null,value.selection);
  }catch{/* An ordinary opening does not carry a one-use native menu ticket. */}
}
el('ps-new').addEventListener('click',()=>start());
el('ps-form').addEventListener('submit',e=>void save(e));
el('ps-form').addEventListener('input',changed);el('ps-form').addEventListener('change',changed);
el('ps-back').addEventListener('click',()=>back());
el('ps-cancel').addEventListener('click',()=>back());
el('ps-stay').addEventListener('click',()=>{el('ps-leave').hidden=true;pendingLeave=null;el('ps-body').focus();});
el('ps-discard').addEventListener('click',()=>{const action=pendingLeave;pendingLeave=null;if(action)action();});
el('ps-delete-cancel').addEventListener('click',()=>{pendingDelete=null;el('ps-delete').hidden=true;});
el('ps-delete-yes').addEventListener('click',()=>void remove());
el('ps-copy-close').addEventListener('click',()=>{el('ps-copy').hidden=true;});
el('ps-web').addEventListener('change',()=>void changeWeb());
el('ps-menu').addEventListener('change',()=>void changeMenu());
root.addEventListener('opendesk-page-changed',()=>void menuRefresh());
root.addEventListener('opendesk-tool-state-changed',()=>void menuRefresh());
(async()=>{
  lock();
  try{
    const saved=await request('storage.get',{key:KEY,withEtag:true});
    if(!/^[0-9a-f]{64}$/.test(saved?.etag||''))throw Error('宿主未提供 ETag 并发保护');
    data=model.load(saved.value);etag=saved.etag;ready=true;index();status('');
    await menuRefresh();await launch();
  }catch(e){ready=false;lock();status('数据读取失败，已阻止写入以保护本机数据：'+e.message,true);}
})();
})();
