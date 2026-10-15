(() => {
'use strict';
const {root,request,setState}=globalThis.OpenDeskTool;
const model=globalThis.OpenDeskPromptShortcutsModel,el=id=>root.querySelector('#'+id);
const dom=(tag,cls='',text='')=>{const n=root.ownerDocument.createElement(tag);n.className=cls;n.textContent=text;return n;};
const KEY='library',MENU_ACTION='add-selection';
let data=model.defaults(),etag=null,ready=false,busy=false,dirty=false,mode='index',editId=null;
let baseline='',expanded=null,pendingDelete=null,pendingLeave=null;
function report(){setState({dirty,busy});}
function status(message='',isError=false){const n=el('ps-status');n.textContent=message;n.hidden=!message;n.dataset.error=String(isError);}
function error(message=''){el('ps-error').textContent=message;el('ps-error').hidden=!message;}
function form(){return {body:el('ps-body').value,label:el('ps-label').value,name:el('ps-name').value,
  shape:'square',enabled:el('ps-enabled').checked};}
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
}
function changed(){
  if(mode!=='form')return;
  dirty=JSON.stringify(form())!==baseline;preview();report();
}
function lock(){
  for(const id of ['ps-new','ps-save','ps-web'])
    el(id).disabled=!ready||busy;
  for(const b of el('ps-list').querySelectorAll('button'))b.disabled=!ready||busy||b.dataset.locked==='1';
  report();
}
function index(){
  mode='index';editId=null;dirty=false;pendingLeave=null;pendingDelete=null;
  el('ps-index').hidden=false;el('ps-edit').hidden=true;el('ps-leave').hidden=true;
  el('ps-copy').hidden=true;error('');render();report();
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
  el('ps-enabled').checked=row?.enabled!==false;error('');el('ps-leave').hidden=true;
  baseline=JSON.stringify(form());dirty=false;preview();report();el('ps-body').focus();
}
function button(parent,text,callback,variant='secondary'){
  const b=dom('button','od-button od-button--'+variant,text);b.type='button';
  b.addEventListener('click',callback);parent.append(b);return b;
}
function render(){
  const list=el('ps-list');list.replaceChildren();
  const enabled=data.items.filter(item=>item.enabled).length;
  el('ps-count').textContent=data.items.length+' 个 · '+enabled+' 个启用';
  el('ps-empty').hidden=data.items.length>0;
  el('ps-web').checked=data.settings.webButtons;
  for(const [i,item] of data.items.entries()){
    const card=dom('article','ps-card'+(!item.enabled?' is-disabled':''));
    const use=button(card,item.body,()=>void copy(item),'quiet');
    use.className='ps-card-use';use.dataset.locked=item.enabled?'0':'1';
    use.setAttribute('aria-label',(item.enabled?'复制完整提示词：':'已停用的提示词：')+(item.nameAuto?model.auto(item.body):item.name));
    use.title=item.enabled?'一键复制完整提示词；ChatGPT 网页左侧按钮可直接插入草稿':'该按钮已停用';
    const meta=dom('div','ps-card-meta'),glyph=dom('div','ps-glyph');
    glyph.setAttribute('aria-hidden','true');
    for(const char of model.parts(item.label))glyph.append(dom('span','',char));
    const name=dom('span','ps-info-name',item.nameAuto?'':item.name);
    const actions=dom('div','ps-card-actions');
    const edit=button(actions,'编辑',()=>start(item.id),'quiet');
    edit.setAttribute('aria-label','编辑 '+item.name);
    const more=button(actions,'⋯',()=>{expanded=expanded===item.id?null:item.id;pendingDelete=null;render();},'quiet');
    more.setAttribute('aria-label','更多操作：'+item.name);
    more.setAttribute('aria-expanded',String(expanded===item.id));
    meta.append(glyph,name,actions);card.append(meta);
    if(expanded===item.id){
      const commands=dom('div','ps-more');
      button(commands,item.enabled?'停用':'启用',()=>void update(item.id,row=>({...row,enabled:!row.enabled})));
      const up=button(commands,'↑ 上移',()=>void move(item.id,-1));up.dataset.locked=i===0?'1':'0';
      const down=button(commands,'↓ 下移',()=>void move(item.id,1));down.dataset.locked=i===data.items.length-1?'1':'0';
      button(commands,'删除',()=>{pendingDelete=item.id;render();
        root.querySelector('.ps-delete-cancel')?.focus();},'danger');
      card.append(commands);
    }
    if(pendingDelete===item.id){
      const confirm=dom('div','ps-confirm');
      confirm.append(dom('p','','确认删除「'+item.name+'」？此操作不能撤销。'));
      const buttons=dom('div','ps-actions');
      const cancel=button(buttons,'取消',()=>{pendingDelete=null;render();});
      cancel.classList.add('ps-delete-cancel');
      button(buttons,'确认删除',()=>void remove(),'danger');
      confirm.append(buttons);card.append(confirm);
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
  try{await commit(next);pendingDelete=null;expanded=null;
    render();status('提示词已删除。');}
  catch(e){status('删除未确认，原列表保留：'+(e.code||e.message),true);}
}
async function changeWeb(){
  if(!ready||busy)return;
  const desired=el('ps-web').checked;
  const next=model.load({...data,settings:{webButtons:desired}});
  try{await commit(next);render();status(desired?'ChatGPT 快捷按钮已开启。':'ChatGPT 快捷按钮已关闭，提示词仍保留。');}
  catch(e){render();status('网页按钮设置未确认：'+(e.code||e.message),true);}
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
el('ps-cancel').addEventListener('click',()=>back());
el('ps-stay').addEventListener('click',()=>{el('ps-leave').hidden=true;pendingLeave=null;el('ps-body').focus();});
el('ps-discard').addEventListener('click',()=>{const action=pendingLeave;pendingLeave=null;if(action)action();});
el('ps-copy-close').addEventListener('click',()=>{el('ps-copy').hidden=true;});
el('ps-web').addEventListener('change',()=>void changeWeb());
(async()=>{
  lock();
  try{
    const saved=await request('storage.get',{key:KEY,withEtag:true});
    if(!/^[0-9a-f]{64}$/.test(saved?.etag||''))throw Error('宿主未提供 ETag 并发保护');
    data=model.load(saved.value);etag=saved.etag;ready=true;index();status('');
    await launch();
  }catch(e){ready=false;lock();status('数据读取失败，已阻止写入以保护本机数据：'+e.message,true);}
})();
})();
