// Extract only the visible preview shell from the real trusted Side Panel.
// The separate sandboxed tool iframe never receives privileged host CSS/JS.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const sourceHtml=new URL('../../src/ui/tool.html',import.meta.url);
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

export function extractSidebarPreviewShell(html,css){
  const nav=html.match(/<nav class="workbench-nav"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  const head=html.match(/<div class="sidebar-tool-view-head od-toolbar od-page-head">[\s\S]*?<\/div>/)?.[0];
  if(!nav||!head||!/id="tab-tools"[^>]*>扩展<\/button>/.test(nav)||
    !/id="sidebar-tool-back"/.test(head)||!/id="sidebar-tool-remove"/.test(head)||
    !/id="sidebar-tool-title"/.test(head))
    fail('real Side Panel navigation/toolbar contract is unavailable');
  const allTabs=[...nav.matchAll(/role="tab"/g)];
  if(allTabs.length!==6)fail('unexpected trusted Side Panel tab count');
  const rules=css.split('\n');
  const shellCss=selectors.map(selector=>{
    const matched=rules.filter(line=>line.startsWith(selector));
    if(matched.length!==1||!matched[0].trimEnd().endsWith('}'))
      fail('missing or ambiguous canonical rule: '+selector);
    return matched[0];
  }).join('\n');
  return Object.freeze({nav,head,css:shellCss,
    digest:sha256(nav+'\n'+head+'\n'+shellCss)});
}
export async function sidebarPreviewShellSource(){
  const [html,css]=await Promise.all([readFile(sourceHtml,'utf8'),readFile(sourceCss,'utf8')]);
  return extractSidebarPreviewShell(html,css);
}
