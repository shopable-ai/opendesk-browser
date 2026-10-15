// Only the fixed, trusted AdBlock DOM factory is executed here at build time.
// The preview uses serialized, inert snapshots; Chrome permissions and privileged code
// are never embedded in the opaque sandbox iframe or executed by preview users.
import {readFile} from 'node:fs/promises';
import {createAdblockPermissionControls} from '../../examples/sidebar-tools/adblock/trusted/host-controls.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY} from '../../examples/sidebar-tools/adblock/trusted/policy.js';

const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fail=value=>{throw Error('E_PREVIEW_ADBLOCK_HOST: '+value);};
class InertNode{
  constructor(tag){
    this.tag=tag;this.children=[];this.attrs=Object.create(null);
    this.className='';this.type='';this.textContent='';this.hidden=false;this.disabled=false;
    this.listeners=Object.create(null);
  }
  append(...nodes){this.children.push(...nodes);}
  setAttribute(name,value){this.attrs[name]=String(value);}
  addEventListener(event,listener){this.listeners[event]=listener;}
  html(){
    const attributes=[...Object.entries(this.attrs)];
    if(this.className)attributes.push(['class',this.className]);
    if(this.type)attributes.push(['type',this.type]);
    if(this.hidden)attributes.push(['hidden','']);
    if(this.disabled)attributes.push(['disabled','']);
    return '<'+this.tag+attributes.map(([key,val])=>' '+key+'="'+escapeHtml(val)+'"').join('')+'>'+
      escapeHtml(this.textContent)+this.children.map(child=>child.html()).join('')+
      '</'+this.tag+'>';
  }
}
const event=()=>({addListener(){},removeListener(){}});
const tool={id:ADBLOCK_ID,version:'1.1.0',capabilities:[ADBLOCK_CAPABILITY]};
const find=(node,attr,value)=>node.attrs?.[attr]===value?node:
  node.children.map(child=>find(child,attr,value)).find(Boolean)||null;
const initial=(enabled,exceptions=[],extra={})=>({
  toolEnabled:true,enabled,exceptions,currentHost:'news.example.com',
  permissions:{dnr:true},rules:{verified:true},...extra
});
async function snapshot(status,mode='ready',view='overview'){
  const doc={createElement:tag=>new InertNode(tag)};
  const parent=new InertNode('section');
  parent.setAttribute('id','sidebar-tool-adblock-native');
  parent.setAttribute('aria-label','广告拦截可信控制');
  const api={storage:{onChanged:event()},permissions:{onAdded:event(),onRemoved:event()}};
  const controls=createAdblockPermissionControls({api,doc,container:parent,
    notice(){},runOperation:async operation=>{
      if(operation!=='adblock.status')fail('unexpected native operation');
      if(mode==='loading')return new Promise(()=>{});
      if(mode==='error')throw Error('[离线模拟] 状态读取失败');
      return structuredClone(status);
    }});
  controls.render(tool,false,true);
  await new Promise(resolve=>setImmediate(resolve));
  if(view!=='overview'){
    const target=find(parent,'data-adblock-nav',view);
    if(!target?.listeners?.click)fail('cannot navigate to source product view '+view);
    target.listeners.click();
  }
  const html=parent.html();
  controls.dispose();
  if(!html.includes('adblock-native-card')||!html.includes('role="switch"')||
     !html.includes('aria-checked='))fail('real trusted AdBlock controls disappeared');
  return html;
}
export async function canonicalAdblockPreviewHost(){
  const [toolHtml,toolCss]=await Promise.all([
    readFile(new URL('../../src/ui/tool.html',import.meta.url),'utf8'),
    readFile(new URL('../../src/ui/tool-shell.css',import.meta.url),'utf8')
  ]);
  if(!/<section id="sidebar-tool-adblock-native"[^>]+hidden><\/section>/.test(toolHtml))
    fail('canonical Side Panel no longer has the trusted AdBlock mount');
  const rows=toolCss.split('\n');
  const selectors=['.sidebar-tool-adblock-native{',
    '.sidebar-tool-adblock-native .adblock-native-card{',
    '.sidebar-tool-adblock-native .adblock-native-toggle{',
    '.sidebar-tool-adblock-native .adblock-native-toggle[aria-checked=true]{'];
  for(const selector of selectors)
    if(rows.filter(row=>row.startsWith(selector)).length!==1)
      fail('missing/ambiguous native UI CSS '+selector);
  const css=rows.filter(row=>row.startsWith('.sidebar-tool-adblock-native')||
    row.startsWith('#sidebar-tool-adblock-native[hidden]')||
    row.startsWith('@media(max-width:350px){.sidebar-tool-adblock-native')||
    row.startsWith('@media(prefers-reduced-motion:reduce){.sidebar-tool-adblock-native')).join('\n');
  const scenarios={
    'on-site-on':[initial(true),'ready'],
    'on-site-off':[initial(true,['news.example.com']),'ready'],
    'off':[initial(false),'ready'],
    'no-permission':[initial(false,[],{permissions:{dnr:false},rules:{verified:false}}),'ready'],
    'restart':[initial(false,[],{restartRequired:true}),'ready'],
    'error':[null,'error'],
    'loading':[null,'loading']
  };
  const snapshots={};
  for(const [name,[status,mode]] of Object.entries(scenarios)){
    for(const view of ['overview','exceptions','settings']){
      const key=name+(view==='overview'?'':'/'+view);
      snapshots[key]=await snapshot(status,mode,view);
    }
  }
  return {css,snapshots};
}
