import {createDeveloperView} from '../../develop-view.js';
import {createDeveloperStarterSource} from '../../developer-starter-source.js';

// UI_PREVIEW_ONLY: all changes stay in this view; no controller or Host is connected.
export function createDeveloperPreviewView(){
  const view=createDeveloperView();
  const starterSource=createDeveloperStarterSource(view);
  for(const id of ['script-run','script-save','script-stop','script-history-run','script-delete',
    'script-download','script-read-run','script-copy-result','sdk-install','sdk-inspect','sdk-revoke',
    'sdk-approval-preview','create-target','check-source','check-target','page-preview-run',
    'page-preview-stop','page-component-compile','task-create-candidate','local-install-confirm']){
    if(view.fields[id])view.patch(id,{disabled:true});
  }
  view.patch('script-current-page-host',{textContent:'仅预览'});
  view.patch('script-current-page-status',{textContent:'未连接网页',data:{state:'unknown'}});
  view.patch('script-current-page-title',{textContent:'无真实网页身份'});
  view.patch('script-status',{textContent:'仅演示 UI，不读取真实数据',data:{state:'unknown'}});
  starterSource.fill();
  // Presentation-only mirror of the editor owner's independent draft slots.
  const draftFields=['script-source','script-params','script-id','script-revision'];
  const initialDraft=Object.fromEntries(draftFields.map(id=>[id,view.fields[id].value]));
  const drafts=new Map();let currentDraft='controller';
  const switchSource=(kind,world)=>{
    const next=kind==='javascript'?world:kind;
    if(next===currentDraft)return;
    drafts.set(currentDraft,Object.fromEntries(draftFields.map(id=>[id,view.fields[id].value])));
    const draft=drafts.get(next);
    starterSource.preserve();
    for(const [id,value] of Object.entries(draft??{...initialDraft,'script-source':'','script-revision':''}))
      view.patch(id,{value});
    if(!draft)starterSource.fill(kind,world);
    currentDraft=next;
  };
  view.patch('local-project-diagnostics',{textContent:'仅预览 · Chrome Native：未连接；源码 Provider：未连接；固定项目身份与源代码均未读取。'});
  view.patch('local-project-select',{options:[
    {label:'选择演示项目（不代表授权）',value:''},
    {label:'Controller 示例 · 仅预览',value:'preview-controller'},
    {label:'Page 示例 · 仅预览',value:'preview-page'}
  ]});
  const feedback=text=>view.patch('local-project-status',{textContent:text,data:{state:'disconnected'}});
  const projectChanged=()=>{
    const local=view.fields['local-project-mode'].checked;
    view.patch('developer-source-switch',{data:{mode:local?'local':'manual'}});
    view.patch('developer-source-title',{textContent:local?'项目连接':'直接编辑'});
    for(const id of ['local-project-tools','local-project-recovery'])view.patch(id,{hidden:!local});
    for(const id of ['manual-source-editor','manual-project-params-tools'])view.patch(id,{hidden:local});
    view.patch('local-project-params-tools',{hidden:!local||view.fields['local-project-select'].value!=='preview-controller'});
    view.patch('local-project-select',{disabled:!local});
    view.patch('script-run',{textContent:local?'运行本地项目':'运行草稿'});
    view.patch('script-save',{textContent:local?'安装固定版本':'保存版本'});
    feedback(!local?'':view.fields['local-project-select'].value
      ?'仅预览 · 已选示例，Native 与源码 Provider 均未连接，无法运行或安装。'
      :'仅预览 · 正式环境从 Native 读取已授权项目；当前没有真实项目授权。');
  };
  view.actions['local-project-mode']=projectChanged;
  view.actions['local-project-select']=projectChanged;
  view.actions['local-project-refresh']=()=>feedback('仅预览 · 无法读取 Native 项目列表；请在正式 Chrome 扩展中刷新。');
  view.actions['local-project-connect']=()=>feedback('仅预览 · 离线文件不能连接本机 OpenDesk；正式扩展使用现有选项页连接。');
  view.actions['local-project-guide-open']=()=>{
    view.patch('local-project-guide',{open:true});
    view.focus('local-project-guide');
    feedback('仅预览 · 下方展示正式项目授权与接入说明。');
  };
  for(const id of ['local-project-refresh','local-project-connect','local-project-guide-open'])view.patch(id,{disabled:false});
  for(const kind of ['javascript','react','vue']){
    view.actions['page-component-'+kind]=()=>{
      switchSource(kind,view.fields['script-javascript-world'].value);
      for(const current of ['javascript','react','vue'])view.patch('page-component-'+current,{checked:current===kind});
      view.patch('script-javascript-world-row',{hidden:kind!=='javascript'});
      view.patch('manual-project-params-tools',{hidden:kind!=='javascript'||view.fields['script-javascript-world'].value==='page'});
    };
  }
  view.actions['script-javascript-world']=()=>{
    switchSource('javascript',view.fields['script-javascript-world'].value);
    view.patch('manual-project-params-tools',{
      hidden:view.fields['script-javascript-world'].value==='page'});
  };
  projectChanged();
  return view;
}
