// Extract only the visible preview shell from the real trusted Side Panel.
// The separate sandboxed tool iframe never receives privileged host CSS/JS.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const sourceHtml=new URL('../../src/ui/tool.html',import.meta.url);
const sourceReact=new URL('../../src/ui/react/tabs/tool-host.tsx',import.meta.url);
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

// Navigation remains in tool.html; the toolbar is owned by React.
// Extract from the compiled product's JSX source, never from deleted old HTML.
export function extractSidebarPreviewShell(html,css,react){
  const nav=html.match(/<nav class="workbench-nav"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  const toolbar=react?.match(/<div className="sidebar-tool-view-head od-toolbar od-page-head">([\s\S]*?)<\/div>/)?.[1];
  if(!nav||!toolbar||!/id="tab-tools"[^>]*>扩展<\/button>/.test(nav))
    fail('real Side Panel navigation/toolbar contract is unavailable');
  for(const id of ['sidebar-tool-back','sidebar-tool-title','sidebar-tool-open-tab',
    'sidebar-tool-settings-open','sidebar-tool-remove']){
    if(!new RegExp('<ToolField as="(?:button|strong)"[^>]* id="'+id+'"').test(toolbar))
      fail('missing real React toolbar control: '+id);
  }
  const body=toolbar.replace(/<ToolField as="(button|strong)"([^>]*)>([\s\S]*?)<\/ToolField>/g,
    (_,tag,jsxAttributes,content)=>{
      const attributes=jsxAttributes.replace(/\bclassName=/g,'class=')
        .replace(/\s+nodeRef=\{[^}]+\}/g,'')
        .replace(/\s+(hidden|disabled)=\{true\}/g,' $1')
        .replace(/\s+(hidden|disabled)=\{false\}/g,'');
      return '<'+tag+attributes+'>'+content+'</'+tag+'>';
    }).replace(/\bstrokeWidth=/g,'stroke-width=')
      .replace(/\bstrokeLinecap=/g,'stroke-linecap=')
      .replace(/\bstrokeLinejoin=/g,'stroke-linejoin=');
  if(body.includes('<ToolField')||/\{[^}]+\}/.test(body))
    fail('unsupported dynamic React toolbar markup');
  const head='<div class="sidebar-tool-view-head od-toolbar od-page-head">'+body+'</div>';
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
  const [html,css,react]=await Promise.all([
    readFile(sourceHtml,'utf8'),readFile(sourceCss,'utf8'),readFile(sourceReact,'utf8')
  ]);
  return extractSidebarPreviewShell(html,css,react);
}
