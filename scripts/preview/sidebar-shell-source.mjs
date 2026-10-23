// Extract only the visible preview shell from the real trusted Side Panel.
// The separate sandboxed tool iframe never receives privileged host CSS/JS.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {renderSidebarReact} from './react-sidebar-ssr.mjs';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';

const sourceCss=new URL('../../src/ui/tool-shell.css',import.meta.url);
const selectors=Object.freeze([
  '.workbench-nav{',
  '.workbench-nav button{',
  '.workbench-nav button[aria-selected=true]{',
  '.workbench-nav button:focus-visible{',
  '.sidebar-tool-view-head{',
  '.sidebar-tool-view-head strong{',
  '.sidebar-tool-view-head .sidebar-tool-icon-action{',
  '.sidebar-tool-view-head .sidebar-tool-icon-action:disabled{',
  '.sidebar-tool-view-head button:focus-visible,',
  '.sidebar-tool-frame{',
  '.sidebar-tool-iframe{',
  '.sidebar-tool-icon-action{',
  '.sidebar-tool-icon-action:hover:not(:disabled){',
  '.sidebar-tool-icon-action:focus-visible::after,'
]);
const sha256=value=>createHash('sha256').update(value).digest('hex');
const fail=message=>{throw Error('E_PREVIEW_SHELL: '+message);};

// Both navigation and toolbar come from the real React render, never an old
// production HTML template or a regex translation of JSX source.
export function extractSidebarPreviewShell(html,css){
  const $=load(html);
  const navigation=$('nav.workbench-nav'),toolbar=$('.sidebar-tool-view-head');
  if(navigation.length!==1||toolbar.length!==1||navigation.find('#tab-tools').text()!=='扩展')
    fail('real React navigation/toolbar contract unavailable');
  for(const id of ['sidebar-tool-back','sidebar-tool-title',
    'sidebar-tool-settings-open','sidebar-tool-remove']){
    if(toolbar.find('#'+id).length!==1)fail('React toolbar action missing: '+id);
  }
  const settings=$('#sidebar-tool-settings-view');
  if(settings.length!==1||settings.find('#sidebar-tool-open-tab').length!==1)
    fail('React settings action missing: sidebar-tool-open-tab');
  if(navigation.find('[role=tab]').length!==6)fail('unexpected real Side Panel tab count');
  const nav=navigation.toString(),head=toolbar.toString();
  // Production CSS may intentionally repeat a selector for later overrides.
  // Preserve every reviewed one-line rule in source order, so the preview
  // reproduces normal browser cascading instead of treating a valid override
  // as an ambiguous source or silently dropping the latest visual change.
  const counts=new Map(selectors.map(selector=>[selector,0]));
  const shellCss=css.split('\n').filter(line=>{
    const selector=selectors.find(value=>line.startsWith(value));
    if(!selector)return false;
    if(!line.trimEnd().endsWith('}'))
      fail('non-canonical rule: '+selector);
    counts.set(selector,counts.get(selector)+1);
    return true;
  }).join('\n');
  for(const [selector,count] of counts){
    if(count===0)fail('missing canonical rule: '+selector);
  }
  return Object.freeze({nav,head,css:shellCss,
    digest:sha256(nav+'\n'+head+'\n'+shellCss)});
}
export async function sidebarPreviewShellSource({tool}={}){
  const toolView=createSidebarToolsView();
  try{
    if(tool==='adblock'){
      // Match the existing Host's opened-AdBlock presentation state. Rendering
      // the unopened default would leave its real React settings action hidden.
      toolView.patch('sidebar-tool-settings-open',{hidden:false,
        title:'打开 AdBlock 产品设置',attributes:{
          'aria-label':'打开 AdBlock 产品设置','aria-controls':'sidebar-tool-frame'}});
    }
    const [html,css]=await Promise.all([
      renderSidebarReact({activeTab:'tools',debugEnabled:true,toolView}),readFile(sourceCss,'utf8')
    ]);
    return extractSidebarPreviewShell(html,css);
  }finally{toolView.dispose();}
}
