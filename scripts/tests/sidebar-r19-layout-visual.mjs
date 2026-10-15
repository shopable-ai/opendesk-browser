#!/usr/bin/env node
// STATIC_MARKUP_CHROME plus SOURCE_UI_SIMULATION_CHROME (read-only fixture client).
// CDP keyboard input tests browser focus/HTML semantics, never installed extension
// authorization, scheduling, Run, Chrome permissions or Native control events.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createOfficialToolResources} from '../build-official-tools.mjs';

const root=resolve('.');
const out=resolve(process.argv[2]||'artifacts/sidebar-r19-layout-visual');
const widths=[300,320,360,420,520];
const sampleWidths=process.argv.includes('--narrow')?[200,240,...widths]:widths;
const scenes=[
  {name:'my',tab:'tasks'},
  {name:'my-long',tab:'tasks',state:'long'},
  {name:'my-empty',tab:'tasks',state:'empty'},
  {name:'my-running',tab:'tasks',state:'running'},
  {name:'my-cloud-open',tab:'tasks',state:'cloud-open'},
  {name:'cloud',tab:'cloud'},
  {name:'cloud-hosting-open',tab:'cloud',state:'cloud-open'},
  {name:'schedule-empty',tab:'tasks',state:'schedule-empty'},
  {name:'schedule-form',tab:'tasks',state:'schedule-form'},
  {name:'schedule-manager',tab:'tasks',state:'schedule-manager'},
  // Keep screenshot scene identifiers stable; these now exercise the single My search panel.
  {name:'discover',tab:'local-discover'},
  {name:'discover-long',tab:'local-discover',state:'long'},
  {name:'discover-empty',tab:'local-discover',state:'empty'},
  {name:'discover-error',tab:'local-discover',state:'error'},
  {name:'workflow',tab:'workflow'},
  {name:'workflow-settings',tab:'workflow',state:'settings'},
  {name:'workflow-approval',tab:'workflow',state:'approval'},
  {name:'workflow-result',tab:'workflow',state:'result'},
  {name:'workflow-steps',tab:'workflow',state:'steps'},
  {name:'workflow-running',tab:'workflow',state:'running'},
  {name:'workflow-manage',tab:'workflow',state:'manage'},
  {name:'develop',tab:'develop'},
  {name:'develop-local',tab:'develop',local:true},
  {name:'develop-local-loading',tab:'develop',local:true,state:'loading'},
  {name:'develop-details',tab:'develop',details:true},
  {name:'develop-error',tab:'develop',state:'error'},
  {name:'develop-install',tab:'develop',local:true,state:'install'},
  {name:'develop-remote',tab:'develop',state:'remote'},
  {name:'tools',tab:'tools'},
  {name:'tools-empty',tab:'tools',state:'empty'},
  {name:'tools-import',tab:'tools',state:'import'},
  {name:'tools-update',tab:'tools',state:'update'},
  {name:'tools-installed',tab:'tools',state:'installed'},
  {name:'tools-open',tab:'tools',state:'open'},
  {name:'tools-error',tab:'tools',state:'error'},
  {name:'debug',tab:'debug'},
  {name:'debug-long',tab:'debug',state:'long'}
];
// One combined expansion/long-text case per formal Tab, rather than a Cartesian
// product of every disclosure and state. Catalog is the Discover detail subview.
scenes.push(...['tasks','local-discover','catalog','workflow','develop','tools','cloud','debug'].map(tab=>({
  name:tab+'-details-long',tab,allDetails:true,longContent:true,
  ...(tab==='workflow'?{state:'steps'}:{})
})),
  {name:'tools-installed-long',tab:'tools',state:'installed',longContent:true},
  {name:'develop-collapsed',tab:'develop',closedDetails:true},
  {name:'develop-single-open',tab:'develop',singleDetail:'developer-results-panel'}
);
const sourceUIOnly=process.argv.includes('--source-ui-only');
const scheduledOnly=sourceUIOnly||process.argv.includes('--scheduled-only');
const staticOnly=process.argv.includes('--static-only');
if(scheduledOnly&&staticOnly)throw Error('Choose either --scheduled-only or --static-only');
const tabFilter=process.argv.find(arg=>arg.startsWith('--tabs='))?.slice(7).split(',');
if(tabFilter){
  scenes.splice(0,scenes.length,...scenes.filter(scene=>tabFilter.includes(scene.tab)));
  if(!scenes.length)throw Error('No static scenes match --tabs');
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=await mkdtemp(join(tmpdir(),'sidebar-r19-static-'));
let chrome,server,socket,port,seq=0,evidenceBinding=[],evidenceChromeVersion=null;
const partialEvidence={samples:[],keyboardSamples:[],navigationSamples:[],sourceUISamples:[]};
const pending=new Map();
function cdp(method,params={}){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method))},20000);
    pending.set(id,{ok(v){clearTimeout(timeout);ok(v)},fail(e){clearTimeout(timeout);fail(e)}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('Evaluate: '+JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function connect(){
  let debugPort;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(debugPort>0)break}catch{}
    await sleep(100);
  }
  if(!debugPort)throw Error('Chrome debug port unavailable');
  const tabs=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  const page=tabs.find(x=>x.type==='page');
  if(!page?.webSocketDebuggerUrl)throw Error('No inspectable Chrome page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data),call=msg.id&&pending.get(msg.id);
    if(!call)return;
    pending.delete(msg.id);
    if(msg.error)call.fail(Error(msg.error.message));else call.ok(msg.result);
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
}

// Test-only fixture: visibility changes and representative rows, never a native MV3 claim.
function setupScene(scene,officialReleases){
  // Restore the real markup's text and open/hidden state between samples. Long
  // titles change text nodes only: permission labels and controls keep their DOM.
  const originals=globalThis.__sidebarStaticOriginals??=new Map();
  for(const [node,value] of originals){
    if(value.kind==='details'){node.open=value.open;node.hidden=value.hidden;}
    else if(value.kind==='value')node.value=value.text;
    else node.textContent=value.text;
  }
  for(const details of document.querySelectorAll('details')){
    if(!originals.has(details))originals.set(details,{kind:'details',open:details.open,hidden:details.hidden});
  }
  const searching=scene.tab==='local-discover';
  const active=searching?'tasks':scene.tab;
  for(const item of document.querySelectorAll('[data-workbench-page]'))
    item.hidden=item.dataset.workbenchPage!==active;
  for(const tab of document.querySelectorAll('[data-workbench-tab]'))
    tab.setAttribute('aria-selected',String(tab.dataset.workbenchTab===(active==='catalog'?'tasks':active)));
  const dock=document.querySelector('#workspace-dock');
  dock.hidden=searching||['catalog','workflow','tools','cloud','debug'].includes(active);
  // Search is now an inline toolbar; no second Discover cards or disclosure exists.
  document.querySelector('#task-search-panel').hidden=!searching;
  document.querySelector('#task-search-toggle').setAttribute('aria-expanded',String(searching));
  document.querySelector('#local-discover-search').value=searching&&scene.state==='long'?'很长的本机自动化任务名称'.repeat(5):'';
  document.querySelector('#tab-debug').hidden=active!=='debug';
  document.querySelector('#cloud-hosting').open=scene.state==='cloud-open';
  const scheduled=scene.state?.startsWith('schedule-')||false;
  document.querySelector('.tasks-surface').hidden=scheduled;
  document.querySelector('#scheduled-panel').hidden=!scheduled;
  document.querySelector('#schedule-list-view').hidden=scene.state!=='schedule-empty';
  document.querySelector('#schedule-form').hidden=scene.state!=='schedule-form';
  document.querySelector('#schedule-task-manager').hidden=scene.state!=='schedule-manager';
  document.querySelector('#schedule-host-status').textContent='静态示例 · 已检查运行宿主';
  document.querySelector('#schedule-plan-list').textContent='静态示例 · 尚无定时计划';
  if(scheduled)dock.hidden=true;
  document.querySelector('#local-install-review').hidden=scene.state!=='install';
  document.querySelector('#local-install-summary').textContent=scene.state==='install'?'静态示例 · 当前候选固定版本，不执行安装':'';
  document.querySelector('#local-install-warning').textContent=scene.state==='install'?'静态示例 · 请确认名称和固定版本':'';
  document.querySelector('#page-component-remote').hidden=scene.state!=='remote';
  document.querySelector('#page-component-remote-status').textContent=scene.state==='remote'?'静态示例 · 请确认固定的 HTTPS 组件依赖':'';

  for(const d of document.querySelectorAll('.dock-actions'))
    d.hidden=d.id!==(active==='tasks'?'task-dock':active==='develop'?'develop-dock':'workflow-dock');
  const manual=document.querySelector('#manual-source-editor');
  const local=document.querySelector('#local-project-tools');
  manual.hidden=Boolean(scene.local);
  local.hidden=!scene.local;
  const sw=document.querySelector('#local-project-mode');
  sw.checked=Boolean(scene.local);
  document.querySelector('#developer-source-switch').dataset.mode=scene.local?'local':'manual';
  for(const key of ['developer-results-panel','page-preview-tools','script-library-tools'])
    document.getElementById(key).open=Boolean(scene.details);
  // Static-only states; never dispatches trusted Run/Stop, install, permission, or network events.
  const taskList=document.querySelector('#task-installed-cards');
  taskList.replaceChildren();
  document.querySelector('#task-selected-workspace').hidden=searching||scene.tab==='tasks'&&scene.state==='empty';
  const taskStatus=document.querySelector('#task-status');
  taskStatus.textContent=scene.tab==='tasks'&&scene.state==='running'?'静态示例 · 正在运行…':
    searching&&scene.state==='error'?'静态示例 · 无法读取已安装任务':
    scene.tab==='tasks'&&scene.state==='error'?'静态示例 · 当前网页不可用':'';
  taskStatus.dataset.state=scene.state==='error'?'error':'';
  document.querySelector('#local-discover-count').textContent=searching
    ?'静态示例 · 已安装任务筛选':'';
  for(const value of ['all','current','disabled'])
    document.querySelector('#local-filter-'+value).setAttribute('aria-pressed',
      String(value===(searching&&scene.state==='empty'?'current':'all')));
  document.querySelector('#task-run').disabled=scene.tab==='tasks'&&scene.state==='running';
  document.querySelector('#task-stop').disabled=scene.state!=='running';
  if((scene.tab==='tasks'||searching)&&scene.state==='empty'){
    const empty=document.createElement('p');
    empty.className=searching?'task-search-empty':'hint';
    empty.textContent=searching?'当前网页暂无匹配任务，选择「全部」查看已安装任务。':'还没有安装任务。';
    taskList.append(empty);
  }else{
    const names=searching
      ?['获取网页标题','网页表单演示','有较长标题的自动化任务名称','网页图片数量统计']
      :['获取网页标题','读取表格并保存结果','检查网页状态'];
    for(const value of names){
      const group=document.createElement('div');group.className='task-card-group';
      const btn=document.createElement('button');btn.className='task-card';btn.type='button';
      const icon=document.createElement('span');icon.className='task-card-icon';icon.textContent='◈';
      const label=document.createElement('span');label.className='task-card-copy';
      const name=document.createElement('strong');
      name.textContent=scene.state==='long'?value.repeat(7):value;
      const desc=document.createElement('small');desc.textContent='仅用于静态布局验证的示例说明';
      label.append(name,desc);btn.append(icon,label);group.append(btn);taskList.append(group);
    }
  }
  const editor=document.querySelector('#workflow-editor');
  editor.dataset.viewState='empty';
  const editing=scene.tab==='workflow'&&['steps','running'].includes(scene.state);
  document.querySelector('#workflow-dock').dataset.empty=String(!editing);
  if(editing)dock.hidden=false;
  dock.dataset.stopOnly=String(scene.state==='running');
  document.querySelector('#task-stop').disabled=!(scene.tab==='tasks'&&scene.state==='running');
  document.querySelector('#workflow-stop').disabled=!(scene.tab==='workflow'&&scene.state==='running');
  if(editing)editor.dataset.viewState='editing';
  document.querySelector('#workflow-plan-panel').hidden=!editing;
  document.querySelector('#workflow-params-panel').hidden=!editing;
  document.querySelector('#workflow-steps').replaceChildren();
  if(editing){
    const step=document.createElement('details');step.className='workflow-step od-disclosure';step.open=true;
    const summary=document.createElement('summary');summary.textContent='1. 填写内容 · 已采用 AI 计划的静态编辑示例';
    const body=document.createElement('div');body.className='workflow-step-body';
    const field=document.createElement('label');field.className='workflow-field';field.textContent='定位目标';
    const input=document.createElement('input');input.value='表单中的内容输入框';field.append(input);
    const actions=document.createElement('div');actions.className='workflow-step-actions';
    for(const text of ['上移','下移','删除']){const b=document.createElement('button');b.type='button';b.textContent=text;actions.append(b);}
    body.append(field,actions);step.append(summary,body);document.querySelector('#workflow-steps').append(step);
    document.querySelector('#workflow-step-count').textContent='1 步';
  }

  document.querySelector('#workflow-manage-panel').hidden=scene.state!=='manage';
  for(const d of document.querySelectorAll('#workflow-manage-panel details'))d.open=scene.state==='manage';
  document.querySelector('#workflow-ai-approval').hidden=scene.state!=='approval';
  document.querySelector('#workflow-ai-approval-scope').textContent=scene.state==='approval'?'静态示例 · 此状态仅验证许可提示尺寸，不提交任何资料':'';
  document.querySelector('#workflow-result-panel').hidden=scene.state!=='result';
  document.querySelector('#workflow-output').textContent=scene.state==='result'?'静态示例 · 执行结果预览':'尚未运行';
  document.querySelector('#workflow-provider-settings').open=scene.state==='settings';
  for(const id of ['debug-pairing','debug-connection','debug-reconcile','debug-slot'])document.getElementById(id).textContent=scene.tab==='debug'&&scene.state==='long'?'静态长状态：等待可信运行宿主连接并完成持久对账':'未检测';
  const devStatus=document.querySelector('#script-status');
  devStatus.textContent=scene.tab==='develop'&&scene.state==='error'?'静态示例 · 网页运行环境不可用':'';
  devStatus.dataset.state=scene.state==='error'?'error':'';
  const localStatus=document.querySelector('#local-project-status');
  localStatus.textContent=scene.tab==='develop'&&scene.state==='loading'?'静态示例 · 正在连接本机项目…':'';
  localStatus.dataset.state=scene.state==='loading'?'loading':'';
  document.querySelector('#local-project-refresh').disabled=scene.state==='loading';
  const toolListView=document.querySelector('#sidebar-tool-list-view');
  const toolDisplay=document.querySelector('#sidebar-tool-display');
  toolListView.hidden=scene.tab==='tools'&&scene.state==='open';
  toolDisplay.hidden=scene.state!=='open';
  const toolFrame=document.querySelector('#sidebar-tool-frame');
  toolFrame.replaceChildren();
  if(scene.tab==='tools'&&scene.state==='open'){
    document.querySelector('#sidebar-tool-title').textContent='网页阅读目录';
    const frame=document.createElement('iframe');frame.className='sidebar-tool-iframe';
    frame.title='静态展示框架 · 不运行工具';frame.setAttribute('sandbox','');
    toolFrame.append(frame);
  }
  const toolImport=document.querySelector('#sidebar-tool-import');
  toolImport.hidden=!(scene.tab==='tools'&&['import','update'].includes(scene.state));
  document.querySelector('#sidebar-tool-preview').hidden=toolImport.hidden;
  document.querySelector('#sidebar-tool-update').hidden=scene.state!=='update';
  document.querySelector('#sidebar-tool-preview-title').textContent='静态示例 · 阅读目录';
  document.querySelector('#sidebar-tool-preview-description').textContent='验证导入与更新审阅内容的换行、内边距和控件尺寸。';
  document.querySelector('#sidebar-tool-preview-capabilities').textContent='当前网页读取 · 用户授权后执行';
  const installedList=document.querySelector('#sidebar-tool-list');
  installedList.replaceChildren();
  if(scene.tab==='tools'&&scene.state==='installed'){
    for(const title of ['网页笔记','阅读目录 · 长标题用于窄屏换行排版检查']){
      const row=document.createElement('div');row.className='sidebar-tool-row';
      const open=document.createElement('button');open.type='button';open.className='sidebar-tool-item';
      const copy=document.createElement('span');copy.className='sidebar-tool-item-copy';
      const strong=document.createElement('strong');strong.textContent=title;
      const small=document.createElement('small');small.textContent='静态示例 · 已安装工具';
      copy.append(strong,small);open.append(copy);
      open.setAttribute('aria-label','打开'+title);
      row.append(open);
      for(const [cls,label,icon] of [
        ['sidebar-tool-site od-icon-button','网站开关','◉'],
        ['sidebar-tool-list-remove od-icon-button','卸载工具','×'],
        ['sidebar-tool-list-tab od-icon-button','新标签页打开','↗']
      ]){
        const action=document.createElement('button');action.type='button';action.className=cls;
        action.textContent=icon;action.title=label;action.setAttribute('aria-label',label);
        row.append(action);
      }
      installedList.append(row);
    }
  }
  const officialRoot=document.querySelector('#sidebar-tool-official-catalog');
  officialRoot.replaceChildren();
  // Static markup only: representative catalog rows, never an installation.
  for(const release of officialReleases){
    const row=document.createElement('div');row.className='sidebar-tool-official od-surface';
    row.dataset.officialToolId=release.toolId;
    const title=document.createElement('strong');title.textContent=release.packageTitle;
    const version=document.createElement('span');version.textContent='v'+release.version;
    const button=document.createElement('button');button.type='button';button.className='od-button';
    button.dataset.officialInstall=release.toolId;button.textContent='安装';
    row.append(title,version,button);officialRoot.append(row);
  }
  document.querySelector('#sidebar-tool-empty').hidden=scene.state!=='empty';
  const toolStatus=document.querySelector('#sidebar-tool-status');
  toolStatus.hidden=scene.state!=='error';
  toolStatus.dataset.state=scene.state==='error'?'error':'';
  toolStatus.textContent=scene.state==='error'?'静态示例 · 工具状态无法读取':'';
  // R4's current index replaces the hidden legacy catalogs. These rows are
  // STATIC_MARKUP fixtures only; no install, permission or host RPC is issued.
  const extensionList=document.querySelector('#extension-center-list');
  extensionList.replaceChildren();
  document.querySelector('#extension-center-list-view').hidden=false;
  document.querySelector('#extension-center-detail').hidden=true;
  document.querySelector('#extension-center-menu').hidden=scene.state!=='import';
  document.querySelector('#extension-center-import-host').append(toolImport);
  if(scene.state!=='empty'){
    for(const title of ['网页笔记','阅读目录 · '+(scene.longContent?'长中文名称用于窄宽度索引扫描'.repeat(8):'当前固定版本')]){
      const row=document.createElement('li');row.className='ec-row';
      const glyph=document.createElement('span');glyph.className='ec-glyph';glyph.textContent='▦';glyph.setAttribute('aria-hidden','true');
      const copy=document.createElement('div');copy.className='ec-copy';
      const line=document.createElement('div');line.className='ec-name-line';
      const name=document.createElement('button');name.type='button';name.className='ec-name';name.textContent=title;name.title=title;
      const kind=document.createElement('span');kind.className='ec-type';kind.textContent='应用';line.append(name,kind);
      const description=document.createElement('span');description.className='ec-description';description.textContent='静态示例 · 原安装记录与网站权限不变';copy.append(line,description);
      const primary=document.createElement('button');primary.type='button';primary.className='ec-action';primary.textContent='打开';primary.setAttribute('aria-label','打开「'+title+'」');
      const more=document.createElement('button');more.type='button';more.className='ec-row-more';more.textContent='⋮';more.setAttribute('aria-label','查看「'+title+'」管理详情');
      row.append(glyph,copy,primary,more);extensionList.append(row);
    }
  }
  document.querySelector('#extension-center-empty').hidden=scene.state!=='empty';
  document.querySelector('#extension-center-empty-text').textContent='还没有已安装扩展，可搜索官方目录或打开应用市场。';
  const extensionStatus=document.querySelector('#extension-center-status');
  extensionStatus.textContent=scene.state==='error'?'读取失败，保留最近一次显示。请重试。':'';
  extensionStatus.dataset.state=scene.state==='error'?'error':'info';
  if(scene.tab==='tools'&&scene.allDetails){
    document.querySelector('#extension-center-list-view').hidden=true;
    document.querySelector('#extension-center-detail').hidden=false;
    const body=document.querySelector('#extension-center-detail-body');body.replaceChildren();
    const head=document.createElement('div');head.className='ec-detail-head';
    const copy=document.createElement('div');copy.className='ec-detail-copy';
    const title=document.createElement('strong');title.textContent='静态详情 · 长中文固定版本名称'.repeat(5);
    const type=document.createElement('span');type.className='ec-type';type.textContent='网页增强';copy.append(title,type);head.append(copy);
    const description=document.createElement('p');description.textContent='仅验证现有详情样式、返回与权限范围的几何，不执行安装或授权。';
    const actions=document.createElement('div');actions.className='ec-detail-actions';
    for(const label of ['停用自动运行','前往开发']){const button=document.createElement('button');button.type='button';button.textContent=label;actions.append(button);}
    const sites=document.createElement('ul');sites.className='ec-sites';
    const site=document.createElement('li');site.textContent='https://example.invalid/'+('long-fixed-revision-path/'.repeat(15));sites.append(site);
    body.append(head,description,actions,sites);
  }
  const panel=document.querySelector('[data-workbench-page="'+active+'"]');
  if(scene.allDetails){
    if(active==='tasks')document.querySelector('#task-history-panel').hidden=false;
    if(active==='workflow')document.querySelector('#workflow-manage-panel').hidden=false;
    if(active==='cloud')document.querySelector('#cloud-request-detail').hidden=false;
    for(const details of panel.querySelectorAll('details'))details.open=true;
  }
  if(scene.closedDetails||scene.singleDetail){
    for(const details of panel.querySelectorAll('details'))details.open=details.id===scene.singleDetail;
  }
  if(scene.longContent){
    const longTitle='长中文标题用于验证窄侧栏换行与权限信息仍然可读'.repeat(5);
    const longUrl='https://example.invalid/'+('very-long-fixed-revision-path/').repeat(12)+'?revision='+('a'.repeat(96));
    const json=JSON.stringify({title:longTitle,url:longUrl,result:{revision:'f'.repeat(64),description:longTitle}},null,2);
    for(const summary of panel.querySelectorAll('details > summary')){
      const node=[...summary.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
      if(!node)continue;
      if(!originals.has(node))originals.set(node,{kind:'text',text:node.textContent});
      node.textContent=originals.get(node).text+' · '+longTitle;
    }
    for(const node of panel.querySelectorAll('pre,textarea,input[type="url"]')){
      if(!node.getClientRects().length)continue;
      const value=node.tagName!=='PRE';
      if(!originals.has(node))originals.set(node,{kind:value?'value':'text',text:value?node.value:node.textContent});
      if(value)node.value=node.type==='url'?longUrl:json;
      else node.textContent=json;
    }
  }
  document.querySelector('#workspace-content').scrollTop=scene.details?230:0;
  return true;
}
function measureScene(scene){
  const get=q=>document.querySelector(q);
  const radius=q=>{const el=get(q);return el?getComputedStyle(el).borderTopLeftRadius:null};
  const box=q=>{const e=get(q);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  const content=get('#workspace-content');
  const panel=get('[data-workbench-page="'+(scene.tab==='local-discover'?'tasks':scene.tab)+'"]');
  const metrics={
    viewport:{width:innerWidth,height:innerHeight},
    coarsePointer:matchMedia('(pointer:coarse)').matches,
    documentOverflow:document.documentElement.scrollWidth>innerWidth+1,
    contentOverflow:content.scrollWidth>content.clientWidth+1,
    panelOverflow:panel.scrollWidth>panel.clientWidth+1,
    activePanel:scene.tab,
    corners:{},
    developGaps:[],
    disclosureHeaders:[],
    disclosureBodies:[],
    iconButtons:[],
    dockOverlap:false
  };
  // Measure every rendered direct summary, including content below the fold.
  // A hidden provider summary is a separate settings subview, not a header.
  const rendered=el=>el.getClientRects().length>0&&getComputedStyle(el).visibility==='visible';
  const border=style=>['Top','Right','Bottom','Left'].map(side=>({
    width:parseFloat(style['border'+side+'Width']),style:style['border'+side+'Style'],color:style['border'+side+'Color']
  }));
  const radii=style=>['TopLeft','TopRight','BottomRight','BottomLeft'].map(corner=>parseFloat(style['border'+corner+'Radius']));
  metrics.disclosureHeaders=[...panel.querySelectorAll('details > summary')].filter(rendered).map((summary,index)=>{
    const details=summary.parentElement,style=getComputedStyle(summary),outer=getComputedStyle(details);
    const r=summary.getBoundingClientRect(),d=details.getBoundingClientRect();
    const title=summary.textContent.replace(/\s+/g,' ').trim();
    const textRange=document.createRange();textRange.selectNodeContents(summary);
    const textRects=[...textRange.getClientRects()];
    return {id:details.id||details.className+'#'+index,component:details.classList.contains('od-disclosure'),
      title:title.slice(0,160),titleLength:title.length,titleTruncated:title.length>160,
      clientWidth:summary.clientWidth,scrollWidth:summary.scrollWidth,width:r.width,
      scrollOverflow:summary.scrollWidth-summary.clientWidth,
      textRectCount:textRects.length,textRects:textRects.slice(0,8).map(rect=>({left:rect.left,right:rect.right,width:rect.width,top:rect.top,bottom:rect.bottom})),
      fontFamily:style.fontFamily,letterSpacing:style.letterSpacing,
      surfaceBackground:outer.backgroundColor,headerBackground:style.backgroundColor,headerInk:style.color,
      flat:details.classList.contains('od-disclosure--flat'),open:details.open,
      wrapping:{whiteSpace:style.whiteSpace,wordBreak:style.wordBreak,overflowWrap:style.overflowWrap,lineBreak:style.lineBreak,
        children:[...summary.children].map(child=>{const s=getComputedStyle(child);return {whiteSpace:s.whiteSpace,wordBreak:s.wordBreak,overflowWrap:s.overflowWrap,lineBreak:s.lineBreak,font:s.font,flex:s.flex};})},
      height:r.height,minHeight:parseFloat(style.minHeight),fontSize:parseFloat(style.fontSize),fontWeight:parseInt(style.fontWeight,10),
      paddingTop:parseFloat(style.paddingTop),paddingRight:parseFloat(style.paddingRight),
      paddingBottom:parseFloat(style.paddingBottom),paddingLeft:parseFloat(style.paddingLeft),
      padding:['Top','Right','Bottom','Left'].map(side=>parseFloat(style['padding'+side])),
      border:border(style),radius:radii(style),containerBorder:border(outer),containerRadius:radii(outer),
      left:r.left,right:r.right,containerLeft:d.left,containerRight:d.right,
      overflow:summary.scrollWidth>summary.clientWidth+1};
  });
  // Bounded body regression: only these direct children, never every descendant.
  // The nested task-management row also exercises the flat component's 0px inset.
  metrics.disclosureBodies=[...panel.querySelectorAll('#task-installed-detail,.task-tools .row,#cloud-clients > .cloud-privacy-note')]
    .filter(child=>child.tagName!=='SUMMARY'&&child.parentElement.matches('details.od-disclosure')&&rendered(child))
    .map((child,index)=>{
      const details=child.parentElement,style=getComputedStyle(child),outer=getComputedStyle(details);
      const r=child.getBoundingClientRect(),d=details.getBoundingClientRect();
      // Measure from the inside of the component border, so unexpected container
      // padding cannot disguise an incorrect public body inset.
      const innerLeft=d.left+parseFloat(outer.borderLeftWidth),innerRight=d.right-parseFloat(outer.borderRightWidth);
      return {id:child.id||child.className+'#'+index,parent:details.id||details.className,
        kind:child.id==='task-installed-detail'?'task-permissions':child.classList.contains('row')?'task-actions':'cloud-privacy',
        flat:details.classList.contains('od-disclosure--flat'),marginLeft:parseFloat(style.marginLeft),marginRight:parseFloat(style.marginRight),
        left:r.left,right:r.right,width:r.width,innerLeft,innerRight,leftInset:r.left-innerLeft,rightInset:innerRight-r.right,
        containerPaddingLeft:parseFloat(outer.paddingLeft),containerPaddingRight:parseFloat(outer.paddingRight)};
    });
  if(scene.closedDetails||scene.singleDetail){
    metrics.developerOpenDetails=[...panel.querySelectorAll('details[open]')].filter(rendered).map(el=>el.id);
  }
  const dock=get('#workspace-dock');
  if(!dock.hidden)metrics.dockOverlap=content.getBoundingClientRect().bottom>dock.getBoundingClientRect().top+1;
  if(metrics.panelOverflow||metrics.contentOverflow){
    const bounds=panel.getBoundingClientRect();
    metrics.overflowOffenders=[...panel.querySelectorAll('*')].filter(el=>el.getClientRects().length).map(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return {id:el.id,tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className.slice(0,75):'',
        left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),
        clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,overflowX:s.overflowX};
    }).filter(x=>x.right>bounds.right+1||x.left<bounds.left-1).sort((a,b)=>b.right-a.right).slice(0,15);
  }
  {
    metrics.iconButtons=[...panel.querySelectorAll('.od-icon-button,.workflow-icon-button,.workflow-send-button')].filter(el=>el.getClientRects().length>0).map(el=>{
      const r=el.getBoundingClientRect();
      return {width:r.width,height:r.height,radius:getComputedStyle(el).borderTopLeftRadius,
        label:el.getAttribute('aria-label'),title:el.getAttribute('title')};
    });
  }

  const groups=[...panel.querySelectorAll('.od-action-group,.workflow-actions,.workflow-step-actions,.workflow-new-review-actions,.schedule-actions,.debug-actions,.local-install-review>.row,.workflow-composer-actions,.schedule-source-row')];
  if(!dock.hidden)groups.push(...dock.querySelectorAll('.dock-buttons'));
  metrics.actionGroups=groups.filter(e=>e.getClientRects().length).map(e=>{
    const r=e.getBoundingClientRect(),style=getComputedStyle(e);
    const buttons=[...e.children].filter(b=>b.tagName==='BUTTON'&&b.getClientRects().length).map(b=>{
      const q=b.getBoundingClientRect();return {id:b.id,text:b.textContent.trim(),top:q.top,center:q.top+q.height/2,left:q.left,right:q.right,width:q.width,height:q.height};
    });
    const rows=[];
    for(const b of buttons){let row=rows.find(row=>Math.abs(row.center-b.center)<1);if(!row){row={center:b.center,left:b.left,right:b.right};rows.push(row);}row.left=Math.min(row.left,b.left);row.right=Math.max(row.right,b.right);}
    return {className:e.className,gap:parseFloat(style.columnGap),left:r.left+parseFloat(style.paddingLeft)+parseFloat(style.borderLeftWidth),right:r.right-parseFloat(style.paddingRight)-parseFloat(style.borderRightWidth),rows,buttons};
  });
  if(scene.tab==='tasks')metrics.corners.taskCard=radius('.task-card-group');
  if(scene.tab==='local-discover'){
    metrics.corners.search=radius('#local-discover-search');
    metrics.corners.filter=radius('.local-discovery-filters button');
    metrics.corners.filterGroup=radius('.local-discovery-filters');
    if(scene.state!=='empty')metrics.corners.taskCard=radius('.task-card-group');
  }
  if(scene.tab==='workflow'){
    metrics.corners.card=radius('.workflow-card');
    metrics.corners.icon=radius('.workflow-icon-button');
  }
  if(scene.tab==='tools'){
    metrics.corners.card=radius('.ec-list');
    metrics.corners.install=radius('.ec-action');
    metrics.extensionTargets=[...panel.querySelectorAll('.ec-icon,.ec-row-more,.ec-action,.ec-name,.ec-detail-back,.ec-detail-actions button')]
      .filter(rendered).map(button=>{const rect=button.getBoundingClientRect();return {
        className:button.className,width:rect.width,height:rect.height,
        label:button.getAttribute('aria-label')||button.textContent.trim()};});
    metrics.extensionCopySizes=[...panel.querySelectorAll('.ec-type,.ec-description,.ec-sites,.ec-message')]
      .filter(rendered).map(element=>({className:element.className,fontSize:parseFloat(getComputedStyle(element).fontSize)}));
  }
  if(scene.tab==='debug'){
    metrics.corners.card=radius('.debug-metrics');
    metrics.corners.detail=radius('.debug-detail');
  }
  if(scene.tab==='develop'){
    metrics.corners.page=radius('#developer-target-detail');
    metrics.corners.editor=radius('#script-source');
    const children=[...get('.developer-editor').children].filter(e=>!e.hidden&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).position!=='absolute'&&e.getBoundingClientRect().height>0);
    const layout=children.map(e=>e.getBoundingClientRect());
    metrics.developGaps=layout.slice(1).map((r,i)=>Math.round(r.top-layout[i].bottom));
    metrics.developerHeaderFirst=children[0]?.classList.contains('developer-context')&&children[0]?.firstElementChild?.id==='developer-source-switch';
    // Keep the historical developer metrics key while using the shared contract.
    metrics.developerDisclosureHeaders=metrics.disclosureHeaders;
    if(!scene.local){
      const label=box('.page-component-label'),choices=box('.page-component-choices');
      metrics.codeType={
        inline:Math.abs((label.top+label.height/2)-(choices.top+choices.height/2))<=1,
        segments:[...get('.page-component-choices').querySelectorAll('label')].map(el=>({
          height:el.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(el).fontSize)
        }))
      };
    }
  }
  return metrics;
}
function validate(scene,width,m){
  if(m.viewport.width!==width||m.viewport.height!==700)throw Error('Unexpected viewport '+JSON.stringify(m));
  if(m.documentOverflow||m.contentOverflow||m.panelOverflow)throw Error('Horizontal overflow '+scene.name+' '+width+'px '+JSON.stringify(m));
  if(m.dockOverlap)throw Error('Footer obscures content '+scene.name+' '+width+'px');
  for(const group of m.actionGroups){
    if(group.buttons.some(b=>b.height<33.5))throw Error('Undersized action '+scene.name+' '+width+'px '+JSON.stringify(group));
    // The schedule creation footer intentionally starts at the leading edge.
    // All other action groups must keep their existing trailing alignment contract.
    const leading=scene.name==='schedule-form'&&group.buttons.some(button=>button.id==='schedule-save');
    if(group.rows.some(row=>Math.abs(leading?row.left-group.left:row.right-group.right)>1))
      throw Error('Action row is not '+(leading?'leading':'trailing')+' aligned '+scene.name+' '+width+'px '+JSON.stringify(group));
    if(group.buttons.length>1&&group.gap!==8)throw Error('Action spacing is not 8px '+scene.name+' '+JSON.stringify(group));
  }

  if(m.codeType&&((width>=300&&!m.codeType.inline)||m.codeType.segments.some(el=>el.height<36||el.fontSize<12)))
    throw Error('Code type label/choices must share a readable, accessible row '+scene.name+' '+width+'px');
  if(['tools','develop'].includes(scene.tab)&&m.iconButtons.some(b=>b.width<33.5||b.height<33.5||b.radius!=='8px'||!b.label||!b.title))
    throw Error('Icon action is not 34px accessible control '+scene.name+' '+width+'px '+JSON.stringify(m.iconButtons));
  if(m.extensionTargets?.some(button=>!button.label||button.width<(m.coarsePointer?43.5:33.5)||button.height<(m.coarsePointer?43.5:33.5)))
    throw Error('Extension action below shared target size '+scene.name+' '+width+'px '+JSON.stringify(m.extensionTargets));
  if(m.extensionCopySizes?.some(copy=>copy.fontSize<12))
    throw Error('Extension metadata below readable public size '+scene.name+' '+width+'px '+JSON.stringify(m.extensionCopySizes));
  const expected={tasks:{taskCard:'12px'},'local-discover':{search:'8px',filter:'8px',filterGroup:'12px',taskCard:'12px'},catalog:{},cloud:{},workflow:{card:'12px',icon:'8px'},develop:{page:'12px',editor:'8px'},tools:{card:'12px',install:'8px'},debug:{card:'12px',detail:'12px'}};
  // An empty task list intentionally has no card whose radius could be measured.
  if(scene.tab==='tasks'&&scene.state==='empty')delete expected.tasks.taskCard;
  if(scene.tab==='local-discover'&&scene.state==='empty')delete expected['local-discover'].taskCard;
  if(scene.tab==='tools'&&scene.state==='empty')delete expected.tools.install;
  for(const [key,value] of Object.entries(expected[scene.tab])){
    if(m.corners[key]!==value)throw Error('Radius mismatch '+scene.name+' '+key+': '+m.corners[key]+' expected '+value);
  }
  if(scene.tab==='develop'&&(!m.developerHeaderFirst||m.developGaps.some(gap=>Math.abs(gap-16)>1)))throw Error('Developer header/gap mismatch '+scene.name+' '+width+'px '+JSON.stringify(m.developGaps));
  for(const item of m.disclosureHeaders){
    const height=m.coarsePointer?44:item.flat?36:44;
    const fail=reason=>{throw Error('Disclosure '+reason+' '+scene.name+' '+width+'px '+JSON.stringify(item));};
    if(!item.component)fail('missing trusted component class');
    if(item.height<height-.5||item.minHeight!==height||item.fontSize!==(item.flat?12:13)||item.fontWeight!==650||
      item.padding.some((value,index)=>value!==(index%2===0?8:item.flat?0:12)))fail('typography/padding/height mismatch');
    if(item.containerBorder.some(b=>b.width!==(item.flat?0:1)||(!item.flat&&b.style!=='solid'))||
      item.containerRadius.some(value=>value!==(item.flat?0:12))||item.radius.some(value=>value!==0)||
      item.border.some((b,index)=>b.width!==(item.open&&index===2?1:0)||
        (b.width>0&&(b.style!=='solid'||b.color==='transparent'||b.color==='rgba(0, 0, 0, 0)'))))fail('border/radius mismatch');
    if(item.overflow||item.left<item.containerLeft-1||item.right>item.containerRight+1)fail('header geometry overflow');
    if(scene.tab==='develop'&&width>=300&&!scene.longContent&&!item.flat&&!item.open&&Math.abs(item.height-height)>1){
      fail('closed developer header has extra vertical spacing');
    }
  }
  for(const item of m.disclosureBodies){
    const inset=item.flat?0:12;
    if(item.marginLeft!==inset||item.marginRight!==inset||
      Math.abs(item.leftInset-inset)>1||Math.abs(item.rightInset-inset)>1||Math.abs(item.leftInset-item.rightInset)>1){
      throw Error('Disclosure body inset mismatch '+scene.name+' '+width+'px '+JSON.stringify(item));
    }
  }
  // Expansion fixtures must actually expose each regression target; an empty
  // measurement array cannot pass just because the affected body stayed hidden.
  if(scene.name==='tasks-details-long'){
    for(const [kind,flat] of [['task-permissions',false],['task-actions',false],['task-actions',true]]){
      if(!m.disclosureBodies.some(item=>item.kind===kind&&item.flat===flat)){
        throw Error('Missing disclosure body regression target '+scene.name+' '+kind+' flat='+flat);
      }
    }
  }
  if(scene.name==='cloud-details-long'&&!m.disclosureBodies.some(item=>item.kind==='cloud-privacy'&&!item.flat)){
    throw Error('Missing expanded Cloud privacy body regression target');
  }
  if(scene.closedDetails&&m.developerOpenDetails.length)throw Error('Developer collapsed scene still has open details');
  if(scene.singleDetail&&(m.developerOpenDetails.length!==1||m.developerOpenDetails[0]!==scene.singleDetail)){
    throw Error('Developer single expansion mismatch '+JSON.stringify(m.developerOpenDetails));
  }
}
async function keyboardDisclosure(scene,selector){
  // CDP Input activates the browser's HTML summary behavior. Extension scripts
  // are absent: this evidence cannot approve a provider, Run, install or Native.
  const prepared=await evaluate(`(()=>{
    const summary=document.querySelector(${JSON.stringify(selector)});
    if(!summary?.getClientRects().length)throw Error('Missing static keyboard summary');
    summary.__staticKeyboardEvents=[];
    if(!summary.__staticKeyboardObserver){
      summary.__staticKeyboardObserver=event=>summary.__staticKeyboardEvents.push({
        type:event.type,key:event.key??null,code:event.code??null,charCode:event.charCode??null,isTrusted:event.isTrusted
      });
      for(const type of ['keydown','keypress','keyup','click'])summary.addEventListener(type,summary.__staticKeyboardObserver);
    }
    summary.scrollIntoView({block:'center'});summary.focus();
    return {open:summary.parentElement.open};
  })()`);
  const key=async(key,code,virtualKey,modifiers=0)=>{
    // Blink activates summary on Enter keypress (charCode 13), while Space
    // activates on keyup. keyDown without text omits the required keypress;
    // Space text also supplies its keypress default action that prevents scroll.
    // Keep only the portable Windows virtual code, not a Windows value in the
    // platform-specific nativeVirtualKeyCode field on Mac.
    const text=code==='Enter'?'\r':code==='Space'?' ':'';
    const params={key,code,windowsVirtualKeyCode:virtualKey,modifiers};
    await cdp('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',...params,
      ...(text?{text,unmodifiedText:text}:{})});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',...params});
  };
  // Traverse with real CDP Tab/Shift+Tab before asserting :focus-visible;
  // programmatic focus by itself is not keyboard-focus evidence.
  await key('Tab','Tab',9,8);
  await key('Tab','Tab',9);
  const read=()=>evaluate(`(async()=>{
    // Runtime.evaluate already uses awaitPromise. Wait one rendering boundary
    // for the input default action/focus layout; never retry a missing toggle.
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const summary=document.querySelector(${JSON.stringify(selector)}),style=getComputedStyle(summary),r=summary.getBoundingClientRect();
    return {focused:document.activeElement===summary,focusVisible:summary.matches(':focus-visible'),
      outlineWidth:parseFloat(style.outlineWidth),outlineStyle:style.outlineStyle,outlineColor:style.outlineColor,
      outlineOffset:parseFloat(style.outlineOffset),top:r.top,bottom:r.bottom,left:r.left,right:r.right,
      viewportWidth:innerWidth,open:summary.parentElement.open,events:summary.__staticKeyboardEvents.slice()};
  })()`);
  const before=await read();
  if(before.open!==prepared.open)throw Error('Static Tab unexpectedly changed disclosure '+selector+' '+JSON.stringify({prepared,before}));
  if(!before.focused||!before.focusVisible||before.outlineWidth<2||['none','hidden'].includes(before.outlineStyle)||
    ['transparent','rgba(0, 0, 0, 0)'].includes(before.outlineColor)||before.outlineOffset<0||
    before.top<0||before.bottom>700||before.left<0||before.right>before.viewportWidth)throw Error('Static keyboard focus not visible '+JSON.stringify(before));
  await key('Enter','Enter',13);
  const enter=await read();
  if(!enter.focused||!enter.focusVisible||enter.open===before.open)throw Error('Static Enter did not toggle summary '+selector+' '+JSON.stringify({before,enter}));
  await key(' ','Space',32);
  const space=await read();
  if(!space.focused||space.open!==before.open||!space.focusVisible)throw Error('Static Space did not restore summary '+selector+' '+JSON.stringify({before,enter,space}));
  return {evidence:'STATIC_MARKUP_CHROME_KEYBOARD',scene:scene.name,selector,before,enter,space};
}

async function nativeTab(reverse=false){
  const params={key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:reverse?8:0};
  await cdp('Input.dispatchKeyEvent',{type:'rawKeyDown',...params});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',...params});
}
async function keyboardNavigation(width,theme){
  const ids=await evaluate(`(()=>{
    const nav=document.querySelector('.workbench-nav');
    const tabs=[...nav.querySelectorAll('button')].filter(b=>!b.hidden);
    const labels=tabs.map(b=>b.textContent.trim());
    if(JSON.stringify(labels)!==JSON.stringify(['我的','扩展','工作流','开发','云控']))
      throw Error('Expected approved R4 five-tab navigation '+JSON.stringify(labels));
    // Source fixture only: make each roving tab reachable with native Tab to
    // measure every CSS ring. This does not test tool-shell's tab routing.
    globalThis.__r19TabIndices=tabs.map(b=>b.tabIndex);
    globalThis.__r19NavEvents=[];
    nav.onkeydown=e=>globalThis.__r19NavEvents.push({key:e.key,shift:e.shiftKey,isTrusted:e.isTrusted});
    tabs.forEach(b=>b.tabIndex=0);tabs[0].focus();
    return tabs.map(b=>b.id);
  })()`);
  const records=[];
  try{
    await nativeTab();await nativeTab(true);
    const path=[...ids.keys(),...Array.from({length:ids.length-1},(_,i)=>ids.length-2-i)];
    for(const index of path){
      if(records.length)await nativeTab(records.length>=ids.length);
      // Fixture reveal only: static HTML has no production tab-navigation JS.
      // Never assigns focus; native Tab above remains the focus authority.
      await evaluate("document.activeElement.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})");
      const m=await evaluate(`(async()=>{
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const b=document.activeElement,nav=document.querySelector('.workbench-nav'),s=getComputedStyle(b);
        const r=b.getBoundingClientRect(),n=nav.getBoundingClientRect(),ns=getComputedStyle(nav);
        const extent=parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset);
        return {id:b.id,focusVisible:b.matches(':focus-visible'),outlineWidth:parseFloat(s.outlineWidth),
          outlineOffset:parseFloat(s.outlineOffset),outlineStyle:s.outlineStyle,outlineColor:s.outlineColor,
          outline:{left:r.left-extent,right:r.right+extent,top:r.top-extent,bottom:r.bottom+extent},
          clip:{left:Math.max(0,n.left),right:Math.min(innerWidth,n.right),top:n.top,bottom:n.bottom},
          overflowY:ns.overflowY,scrollLeft:nav.scrollLeft,events:globalThis.__r19NavEvents.slice()};
      })()`);
      if(m.id!==ids[index]||!m.focusVisible||m.outlineWidth<2||m.outlineOffset!==-3||
        ['none','hidden'].includes(m.outlineStyle)||['transparent','rgba(0, 0, 0, 0)'].includes(m.outlineColor)||
        m.overflowY!=='hidden'||m.outline.left<m.clip.left-.5||m.outline.right>m.clip.right+.5||
        m.outline.top<m.clip.top-.5||m.outline.bottom>m.clip.bottom+.5||
        !m.events.length||m.events.some(e=>!e.isTrusted))throw Error('Navigation focus clipped '+JSON.stringify({width,theme,index,m}));
      records.push(m);
    }
    return {evidence:'STATIC_MARKUP_CHROME_KEYBOARD',width,theme,
      fixture:'approved R4 five tabindex=0 + scrollIntoView reveal; production routing NOT_TESTED',records};
  }finally{
    await evaluate(`document.querySelectorAll('.workbench-nav button:not([hidden])').forEach((b,i)=>b.tabIndex=globalThis.__r19TabIndices[i]);document.querySelector('.workbench-nav').onkeydown=null`);
  }
}
// Imported production renderer, explicitly simulated data and denied mutations.
async function setupScheduledSimulation(count,mode){
  globalThis.__r19Scheduled?.dispose();
  for(const page of document.querySelectorAll('[data-workbench-page]'))page.hidden=page.dataset.workbenchPage!=='tasks';
  document.querySelector('#tab-debug').hidden=true;
  document.querySelector('#workspace-dock').hidden=true;
  const {createScheduledTaskWorkbench}=await import('/src/ui/scheduled-task-workbench.js');
  document.querySelector('#schedule-plan-list').replaceChildren();
  document.querySelector('#schedule-detail-view').replaceChildren();
  document.querySelector('#schedule-detail-view').dataset.scheduleId='';
  const now=Date.UTC(2026,9,14,1);
  const history=Array.from({length:120},(_,i)=>({fireId:'simulation-fire-'+i,
    scheduledAt:now-i*60000,status:i%3===0?'UNKNOWN':i%3===1?'FAILED':'SUCCESS',
    runId:'simulation-run-'+i,resultId:i%3===2?'simulation-result-'+i:null,
    retirementState:i%3===2?'released':'pending'}));
  const plans=Array.from({length:count},(_,i)=>({scheduleId:'simulation-plan-'+i,
    title:'源UI模拟只读计划 '+(i+1)+' · 每日核对项目进度与长中文说明、失败处理和结果人工确认'.repeat(3),
    taskId:'simulation-task',version:'1.0.0',generation:1,timezone:'Asia/Shanghai',
    triggerKind:'daily',triggerSpec:{hour:9,minute:0},nextDueAt:now+i*60000,
    targetUrl:'https://example.invalid/'+('very-long-target-path-'.repeat(12)),
    paused:false,needsAttention:i===count-1&&count>1,params:{},history:history.slice(0,20)}));
  globalThis.__r19Reads=[];globalThis.__r19Denied=[];
  let historyFailure=mode==='history-error';
  const client={async request(method,input){
    globalThis.__r19Reads.push({method,input});
    if(method==='listTaskCatalog')return {catalog:[],installed:[]};
    if(method==='listSchedules'){
      if(mode==='read-error')throw Error('源UI模拟读取失败；未连接真实调度器');
      return {schedules:plans};
    }
    if(method==='listScheduleHistory'){
      if(input.scheduleId!=='simulation-plan-0'||input.limit!==20)throw Error('Unexpected simulated history request');
      if(historyFailure){historyFailure=false;throw Error('源UI模拟历史读取失败');}
      return {history:history.slice(input.offset,input.offset+input.limit),hasMore:input.offset+input.limit<history.length};
    }
    globalThis.__r19Denied.push(method);throw Error('Read-only simulation denied '+method);
  }};
  const denied=()=>{globalThis.__r19Denied.push('host/api');throw Error('No real Chrome/Host capabilities in source UI simulation');};
  globalThis.__r19Scheduled=createScheduledTaskWorkbench({client,
    host:{currentRun:null,stop:denied},api:{permissions:{contains:denied,request:denied},tabs:{create:denied},runtime:{getURL:denied}},
    taskWorkbench:{navigate(tab){if(tab!=='tasks')denied();},setScheduledSurfaceActive(){}},
    onOpen(){document.querySelector('#workspace-dock').hidden=true;}});
  await globalThis.__r19Scheduled.open();
  await new Promise(resolve=>requestAnimationFrame(resolve));
}
function measureScheduled(selector){
  const content=document.querySelector('#workspace-content'),panel=document.querySelector('#scheduled-panel');
  const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const root=document.documentElement,c=rect(content);
  const visible=el=>el.getClientRects().length>0;
  const offenders=[...panel.querySelectorAll('*')].filter(visible).map(el=>({tag:el.tagName,id:el.id,className:el.className,
    ...rect(el),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth})).filter(r=>r.left<c.left-1||r.right>c.right+1||r.scrollWidth>r.clientWidth+1);
  const target=selector?document.querySelector(selector):null;
  return {viewportWidth:innerWidth,darkMedia:matchMedia('(prefers-color-scheme:dark)').matches,root:{clientWidth:root.clientWidth,scrollWidth:root.scrollWidth},
    content:{...c,clientWidth:content.clientWidth,scrollWidth:content.scrollWidth,scrollTop:content.scrollTop,scrollHeight:content.scrollHeight,clientHeight:content.clientHeight},
    panel:{...rect(panel),clientWidth:panel.clientWidth,scrollWidth:panel.scrollWidth},offenders,
    target:target?rect(target):null,cardCount:document.querySelectorAll('.schedule-card').length,
    historyCount:document.querySelectorAll('.schedule-history-row').length,
    listHidden:document.querySelector('#schedule-list-view').hidden,detailHidden:document.querySelector('#schedule-detail-view').hidden,
    detailPlan:document.querySelector('#schedule-detail-view').dataset.scheduleId,
    historyMessage:document.querySelector('.schedule-history-status')?.textContent||'',
    recoveryFontSizes:[...document.querySelectorAll('.schedule-status-guidance')].map(node=>parseFloat(getComputedStyle(node).fontSize)),
    message:document.querySelector('#schedule-message').textContent,reads:globalThis.__r19Reads.slice(),denied:globalThis.__r19Denied.slice()};
}
function validateScheduled(m,width,reach=false){
  if(m.viewportWidth!==width||m.root.scrollWidth>width+1||m.content.scrollWidth>m.content.clientWidth+1||
    m.panel.scrollWidth>m.panel.clientWidth+1||m.panel.width<=0||m.offenders.length||m.denied.length)
    throw Error('Source scheduled horizontal overflow/capability failure '+JSON.stringify(m));
  if(reach&&(!m.target||m.target.height<=0||m.target.top<m.content.top-1||m.target.bottom>m.content.bottom+1||
    m.target.left<m.content.left-1||m.target.right>m.content.right+1))throw Error('Source scheduled last row unreachable '+JSON.stringify(m));
}
async function scheduledSamples(width,theme){
  const samples=[];
  const clickHistory=async()=>{
    const point=await evaluate(`(()=>{const b=document.querySelector('.schedule-load-more');if(!b||b.disabled)throw Error('Missing enabled history action');b.scrollIntoView({block:'end'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{
      type,...point,button:'left',clickCount:1});
    await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
  };
  const capture=async(name,selector,reach=false)=>{
    if(selector)await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'end'})`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
    const m=await evaluate('('+measureScheduled.toString()+')('+JSON.stringify(selector||null)+')');
    validateScheduled(m,width,reach);
    if(m.darkMedia!==(theme==='dark'))throw Error('Source UI theme emulation mismatch');
    samples.push({evidence:'SOURCE_UI_SIMULATION_CHROME',scene:name,width,theme,...m});
    const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
    await writeFile(join(out,name+'-'+theme+'-'+width+'x700.png'),Buffer.from(screenshot.data,'base64'));
    return m;
  };
  for(const count of [1,20]){
    await evaluate('('+setupScheduledSimulation.toString()+')('+count+',"normal")');
    const m=await capture('source-schedule-'+count+'-last-card','.schedule-card:last-child',true);
    if(m.cardCount!==count||m.listHidden||!m.detailHidden||m.historyCount)throw Error('Expected compact source index '+JSON.stringify(m));
    if(count===20&&m.content.scrollHeight<=m.content.clientHeight)throw Error('Long list fixture did not exercise scrolling');
    // Fixture navigation is intentionally separate from native keyboard evidence.
    await evaluate('document.querySelector(".schedule-plan-open").click()');
    const detail=await capture('source-schedule-'+count+'-detail');
    if(!detail.listHidden||detail.detailHidden||detail.detailPlan!=='simulation-plan-0')throw Error('Detail is not independent '+JSON.stringify(detail));
    const keyboard=await keyboardDisclosure({name:'source-schedule-'+count+'-detail'},'#schedule-detail-view .schedule-history > summary');
    if(keyboard.before.outlineOffset<=0)throw Error('Non-nav focus must retain positive outline offset');
    samples.push({...keyboard,evidence:'SOURCE_UI_SIMULATION_CHROME_KEYBOARD',width,theme});
    await evaluate('document.querySelector("#schedule-detail-view .schedule-history").open=true');
    for(let i=0;i<6;i++){
      const state=await evaluate(`(()=>{const b=document.querySelector('.schedule-load-more');if(!b)return 'done';if(b.disabled)throw Error('Pending history request');return 'loading';})()`);
      if(state==='done')break;
      await clickHistory();
      for(let wait=0;wait<50;wait++){
        if(await evaluate('!document.querySelector(".schedule-load-more")?.disabled'))break;
        await sleep(20);
      }
    }
    const history=await capture('source-schedule-'+count+'-history120','.schedule-history-row:last-of-type',true);
    if(history.historyCount!==120||history.target.height<=0||history.reads.filter(r=>r.method==='listScheduleHistory').length!==5||
      await evaluate('Boolean(document.querySelector(".schedule-load-more"))'))throw Error('120 source history not fully rendered');
    if(!history.recoveryFontSizes.length||history.recoveryFontSizes.some(size=>size<12))throw Error('Critical recovery guidance is too small');
    if(!await evaluate(`document.activeElement===document.querySelector('.schedule-history > summary')`))throw Error('Final history page lost its visible focus target');
    if(!await evaluate(`document.querySelector('.schedule-history').textContent.includes('结果未确认')&&document.querySelector('.schedule-history').textContent.includes('失败')`))throw Error('Missing UNKNOWN/FAILED source status');
  }
  await evaluate('('+setupScheduledSimulation.toString()+')(1,"history-error")');
  await evaluate('document.querySelector(".schedule-plan-open").click();document.querySelector(".schedule-history").open=true');
  await clickHistory();
  await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
  const error=await capture('source-schedule-history-error','.schedule-load-more',true);
  if(!error.historyMessage.includes('源UI模拟历史读取失败')||!await evaluate('document.querySelector(".schedule-load-more").textContent.includes("重试")'))throw Error('History error not actionable');
  await clickHistory();
  const recovered=await capture('source-schedule-history-recovered','.schedule-load-more',true);
  if(recovered.historyMessage||recovered.historyCount!==40||!await evaluate('document.querySelector(".schedule-history-status").hidden'))throw Error('Successful history retry still displays its old failure');
  await evaluate('('+setupScheduledSimulation.toString()+')(1,"read-error")');
  const readError=await capture('source-schedule-read-error');
  if(!readError.message.includes('读取计划失败'))throw Error('Missing simulated read error');
  await evaluate('globalThis.__r19Scheduled.dispose();globalThis.__r19Scheduled=null');
  return samples;
}
try{
  await mkdir(out,{recursive:true});
  const officialReleases=(await createOfficialToolResources()).catalog.apps;
  const [source,tokens,design,style,hostingStyle,timeReviewStyle]=await Promise.all([
    readFile(join(root,'src/ui/tool.html'),'utf8'),
    readFile(join(root,'src/ui/design-tokens.css'),'utf8'),
    readFile(join(root,'src/ui/design-system.css'),'utf8'),
    readFile(join(root,'src/ui/tool-shell.css'),'utf8'),
    readFile(join(root,'src/ui/cloud-hosting.css'),'utf8'),
    // scripts/prepare-public.mjs copies this first-party source to ui/time-review.css.
    readFile(join(root,'examples/sidebar-tools/time-review/src/style.css'),'utf8')
  ]);
  const sourceInputs=['src/ui/tool.html','src/ui/design-tokens.css','src/ui/design-system.css','src/ui/tool-shell.css','src/ui/cloud-hosting.css','examples/sidebar-tools/time-review/src/style.css'];
  const sha=value=>createHash('sha256').update(value).digest('hex');
  const sourceBinding=[source,tokens,design,style,hostingStyle,timeReviewStyle].map((contents,index)=>({path:sourceInputs[index],sha256:sha(contents)}));
  const sourceModules=new Map();
  async function collectModule(path){
    if(sourceModules.has(path))return;
    if(!path.startsWith(join(root,'src')+'/')||!path.endsWith('.js'))throw Error('Outside required source module closure '+path);
    const code=await readFile(path,'utf8');sourceModules.set(path,code);
    sourceBinding.push({path:path.slice(root.length+1),sha256:sha(code)});
    for(const match of code.matchAll(/(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g)){
      if(!match[1].startsWith('.'))throw Error('Nonlocal source module dependency '+match[1]);
      await collectModule(resolve(path,'..',match[1]));
    }
  }
  if(!staticOnly&&(!tabFilter||tabFilter.includes('tasks')))
    await collectModule(join(root,'src/ui/scheduled-task-workbench.js'));
  const bookmarkStyle=await readFile(join(root,'src/ui/bookmark-manager.css'),'utf8');
  const extensionCenterStyle=await readFile(join(root,'src/ui/extension-center.css'),'utf8');
  sourceBinding.push({path:'src/ui/bookmark-manager.css',sha256:sha(bookmarkStyle)},
    {path:'src/ui/extension-center.css',sha256:sha(extensionCenterStyle)},
    {path:'scripts/tests/sidebar-r19-layout-visual.mjs',sha256:sha(await readFile(join(root,'scripts/tests/sidebar-r19-layout-visual.mjs')))});
  evidenceBinding=sourceBinding;
  const html=source.replace(/<script src="tool-shell\.js"><\/script>/,'');
  if(html===source)throw Error('Expected script marker missing: refusing native JS execution in static fixture');
  server=createServer((req,res)=>{
    const name=req.url?.split('?')[0];
    if(name==='/ui/tool.html')res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
    else if(name==='/ui/design-tokens.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(tokens);
    else if(name==='/ui/design-system.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(design);
    else if(name==='/ui/tool-shell.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(style);
    else if(name==='/ui/cloud-hosting.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(hostingStyle);
    else if(name==='/ui/time-review.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(timeReviewStyle);
    else if(name==='/ui/bookmark-manager.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(bookmarkStyle);
    else if(name==='/ui/extension-center.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(extensionCenterStyle);
    else if(sourceModules.has(root+name))res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(sourceModules.get(root+name));
    else res.writeHead(404).end();
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  port=server.address().port;
  chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--hide-scrollbars','--no-first-run','--no-default-browser-check',
    ...(process.platform==='darwin'?['--use-mock-keychain','--password-store=basic']:[]),
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:'ignore'});
  await connect();
  const nav=await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/ui/tool.html'});
  if(nav.errorText)throw Error('Static navigation failed '+nav.errorText);
  let ready=false;
  for(let i=0;i<100;i++){
    if(await evaluate('document.readyState==="complete" && document.styleSheets.length===document.querySelectorAll("link[rel=stylesheet]").length && [...document.querySelectorAll("link[rel=stylesheet]")].every(link=>link.sheet) && !!document.querySelector("#workbench-develop")')){ready=true;break}
    await sleep(100);
  }
  if(!ready)throw Error('Real Sidebar HTML/CSS did not load in static Chrome');
  const chromeVersion=await cdp('Browser.getVersion');evidenceChromeVersion=chromeVersion;
  const staticScenes=scheduledOnly?[]:scenes;
  const samples=partialEvidence.samples;
  for(const width of sampleWidths){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
    for(const scene of staticScenes){
      await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
      if(scene.state==='cloud-open')await evaluate('document.querySelector("#cloud-hosting").scrollIntoView({block:"start"})');
      const m=await evaluate('('+measureScene.toString()+')('+JSON.stringify(scene)+')');
      validate(scene,width,m);
      samples.push({scene:scene.name,width,...m});
      const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(out,scene.name+'-'+width+'x700.png'),Buffer.from(image.data,'base64'));
      console.log('SIDEBAR_R19_STATIC_LAYOUT_PASS',scene.name,width);
    }
  }

  // Coarse-pointer geometry only; this never claims a native touch event or zoom pass.
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  if(!await evaluate('matchMedia("(pointer:coarse)").matches'))throw Error('Coarse-pointer media emulation unavailable');
  for(const width of sampleWidths){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
    for(const scene of staticScenes.filter(s=>['develop','workflow-settings','cloud-hosting-open','tools-installed','schedule-form',
      'tasks-details-long','workflow-details-long','tools-installed-long','cloud-details-long','develop-single-open'].includes(s.name))){
      await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
      if(scene.state==='cloud-open')await evaluate('document.querySelector("#cloud-hosting").scrollIntoView({block:"start"})');
      const m=await evaluate('('+measureScene.toString()+')('+JSON.stringify(scene)+')');validate(scene,width,m);
      if(m.actionGroups.some(g=>g.buttons.some(b=>b.height<43.5))||m.iconButtons.some(b=>b.height<43.5||b.width<43.5)||m.codeType?.segments.some(s=>s.height<43.5))throw Error('Coarse pointer target below 44px '+scene.name);
      samples.push({scene:scene.name,width,pointer:'coarse',...m});
      const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(out,scene.name+'-coarse-'+width+'x700.png'),Buffer.from(image.data,'base64'));
    }
  }
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:false});
  const keyboardSamples=partialEvidence.keyboardSamples;
  for(const [name,selector] of [
    ['develop-collapsed','#developer-target-detail > summary'],
    ['develop-single-open','#developer-results-panel > summary'],
    ['cloud-hosting-open','#cloud-hosting > summary']
  ]){
    const scene=staticScenes.find(s=>s.name===name);
    if(!scene)continue;
    await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
    keyboardSamples.push(await keyboardDisclosure(scene,selector));
  }
  // R31: compare rendered public disclosures from two distinct trusted Tabs.
  // Hover is CDP input on source HTML/CSS, not an installed extension or native acceptance.
  for(const width of widths){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
    for(const theme of ['light','dark']){
      await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      const pair=[];
      for(const [scene,selector] of [
        [{name:'develop-single-open',tab:'develop',singleDetail:'developer-results-panel'},'#developer-results-panel > summary'],
        [{name:'cloud-hosting-open',tab:'cloud',state:'cloud-open'},'#cloud-hosting > summary']
      ]){
        await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
        const sel=JSON.stringify(selector);
        const rect=await evaluate('(()=>{const e=document.querySelector('+sel+');if(!e)throw Error("Missing R31 header");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
        await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y});
        const value=await evaluate('(()=>{const e=document.querySelector('+sel+'),s=getComputedStyle(e),o=getComputedStyle(e.parentElement);return {hovered:e.matches(":hover"),open:e.parentElement.open,surface:o.backgroundColor,border:o.borderTopColor,radius:o.borderTopLeftRadius,headerBackground:s.backgroundColor,color:s.color,minHeight:s.minHeight,padding:s.padding,borderBottom:s.borderBottomColor}})()');
        if(!value.hovered||!value.open)throw Error('Missing disclosure Hover/Open contract '+scene.name+' '+width+' '+theme+' '+JSON.stringify(value));
        pair.push({scene:scene.name,...value});
      }
      for(const key of ['surface','border','radius','headerBackground','color','minHeight','padding','borderBottom'])
        if(pair[0][key]!==pair[1][key])throw Error('Cross-Tab disclosure computed-style mismatch '+theme+' '+width+' '+key+' '+JSON.stringify(pair));
      samples.push({evidence:'STATIC_MARKUP_CHROME_COMPONENT_EQUIVALENCE',width,theme,pair});
    }
  }
  await cdp('Emulation.setEmulatedMedia',{features:[]});
  // Limited media smoke samples reuse the same product HTML and geometry checks.
  for(const [name,width,features] of [
    ['tools-installed-long',320,[{name:'prefers-color-scheme',value:'dark'}]],
    ['develop-single-open',520,[{name:'prefers-reduced-motion',value:'reduce'}]]
  ]){
    await cdp('Emulation.setEmulatedMedia',{features});
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
    const scene=staticScenes.find(s=>s.name===name);
    if(!scene)continue;
    await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
    const media=await evaluate('('+JSON.stringify(features)+').map(f=>({name:f.name,value:f.value,matches:matchMedia("("+f.name+":"+f.value+")").matches}))');
    if(media.some(feature=>!feature.matches))throw Error('Static media emulation unavailable '+JSON.stringify(media));
    const m=await evaluate('('+measureScene.toString()+')('+JSON.stringify(scene)+')');validate(scene,width,m);
    samples.push({scene:scene.name,width,media,...m});
    const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
    await writeFile(join(out,scene.name+'-'+features[0].value+'-'+width+'x700.png'),Buffer.from(image.data,'base64'));
  }
  await cdp('Emulation.setEmulatedMedia',{features:[]});
  const {navigationSamples,sourceUISamples}=partialEvidence;
  for(const theme of ['light','dark']){
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
    for(const width of widths){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
      await evaluate('('+setupScene.toString()+')('+JSON.stringify({name:'my',tab:'tasks'})+','+JSON.stringify(officialReleases)+')');
      if(!sourceUIOnly)navigationSamples.push(await keyboardNavigation(width,theme));
      if(!staticOnly&&(!tabFilter||tabFilter.includes('tasks')))sourceUISamples.push(...await scheduledSamples(width,theme));
      console.log(sourceUISamples.length?'SIDEBAR_R19_SOURCE_UI_PASS':'SIDEBAR_R19_NAVIGATION_FOCUS_PASS',theme,width);
    }
  }
  await cdp('Emulation.setEmulatedMedia',{features:[]});
  for(const item of sourceBinding)if(sha(await readFile(join(root,item.path)))!==item.sha256)throw Error('Relevant input drift '+item.path);
  await writeFile(join(out,'metrics.json'),JSON.stringify({
    evidence:'STATIC_MARKUP_CHROME',nativeExtension:false,nativeControlEvents:false,
    source:sourceInputs.join(' + '),sourceBinding,inputsStable:true,chromeVersion,samples,keyboardSamples,navigationSamples,sourceUISamples,
    sourceUIEvidence:sourceUISamples.length?'SOURCE_UI_SIMULATION_CHROME':'NOT_TESTED',installedNative:'NOT_TESTED',
    navigationEvidence:sourceUIOnly?'NOT_TESTED: P0 source UI scope only':'STATIC_MARKUP_CHROME_KEYBOARD',
    limitations:['read-only simulated schedule client; no real Chrome permissions, Run or Native claims','CDP CSS viewport/media emulation; actual Side Panel and browser zoom NOT_TESTED'],
    resources:{profile,port,chromePid:chrome.pid,release:'finally closes socket/server, terminates owned Chrome and removes temporary profile'}
  },null,2)+'\n');
  console.log('SIDEBAR_R21_STATIC_STATES_ALL_PASS '+samples.length);
  console.log(sourceUIOnly?'SIDEBAR_R19_NAVIGATION_NOT_TESTED source-ui-only':'SIDEBAR_R19_NAVIGATION_ALL_PASS '+navigationSamples.length);
  if(sourceUISamples.length)console.log('SIDEBAR_R19_SOURCE_UI_ALL_PASS '+sourceUISamples.length);
}catch(error){
  await writeFile(join(out,'failure.json'),JSON.stringify({status:'FAIL',error:error.stack,sourceBinding:evidenceBinding,
    chromeVersion:evidenceChromeVersion,partialEvidence,installedNative:'NOT_TESTED'},null,2)+'\n');
  throw error;
}finally{
  try{socket?.close()}catch{}
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  try{chrome?.kill('SIGTERM')}catch{}
  for(let i=0;i<30&&chrome?.exitCode===null&&chrome?.signalCode===null;i++)await sleep(100);
  if(chrome?.exitCode===null&&chrome?.signalCode===null){
    chrome.kill('SIGKILL');
    await new Promise(resolve=>chrome.once('exit',resolve));
  }
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  await writeFile(join(out,'resources-released.json'),JSON.stringify({status:'released',profile,profileRemoved:true,
    port,serverClosed:!server?.listening,chromePid:chrome?.pid,chromeExitCode:chrome?.exitCode,chromeSignal:chrome?.signalCode,
    distWritten:false,publicWritten:false},null,2)+'\n');
}
