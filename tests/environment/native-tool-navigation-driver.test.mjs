import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';

// Component selector guard only; simulated DOM is never Native evidence.
const source=readFileSync(new URL('../framework/sidebar-tools-native-probes.mjs',import.meta.url),'utf8');
const expression=source.match(/async function toolNavigation\(id\)\{\s*return evaluate\(client,`([\s\S]*?)`,id\);\s*\}/)?.[1];
assert(expression,'Extract the exact read-only selector expression used by the native driver');
const title=JSON.parse(readFileSync(new URL('../../examples/sidebar-tools/quick-notes/tool.config.json',import.meta.url),'utf8')).title;
function inspect(names,modern,{ids=names.map((_,i)=>'tool-'+i),duplicateOpen=false}={}){
  const buttons=names.map((text,i)=>({textContent:text,dataset:{sidebarToolId:ids[i],sidebarToolAction:'open'},querySelector:()=>modern?{textContent:text}:null}));
  // Keep an unrelated legacy remove control as selector interference. Current
  // product rows have one open-details button; removal lives in its details.
  const rows=buttons.map(button=>[button,{textContent:'卸载',dataset:{sidebarToolId:button.dataset.sidebarToolId,sidebarToolAction:'remove'},querySelector:()=>null}]);
  const list={querySelectorAll:selector=>selector==='button[data-sidebar-tool-action="open"]'?buttons:modern?rows.flat():buttons};
  const document={querySelector:selector=>selector===(modern?'#sidebar-tool-list':'#sidebar-tool-tabs')?list:null,querySelectorAll:selector=>{
    const id=selector.match(/data-sidebar-tool-id="([-.a-zA-Z0-9_]+)"/)?.[1];
    const targets=rows.flat().filter(button=>button.dataset.sidebarToolId===id&&button.dataset.sidebarToolAction==='open');
    return duplicateOpen?[...targets,...targets]:targets;
  }};
  return JSON.parse(JSON.stringify(runInNewContext(expression,{document})));
}

test('native tool navigation uniquely identifies an open action among nested rows and remove buttons',()=>{
  const html=readFileSync(new URL('../../src/ui/tool.html',import.meta.url),'utf8');
  const product=readFileSync(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
  assert.match(html,/id="sidebar-tool-list"/);assert.match(html,/id="sidebar-tool-back"/);
  // Execute the actual row producer with a small component DOM. A source shape
  // assertion for the old inline uninstall button rejected the newer layout.
  const producers=[];
  const visit=node=>{if(!node||typeof node!=='object')return;
    if(node.type==='FunctionDeclaration'&&node.id?.name==='renderInstalledTools')producers.push(node);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else visit(value);};
  visit(parse(product,{ecmaVersion:'latest',sourceType:'module'}));assert.equal(producers.length,1);
  const element=tag=>({tag,children:[],dataset:{},attributes:{},handlers:{},
    append(...rows){this.children.push(...rows);},replaceChildren(...rows){this.children=rows;},
    setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,handler){this.handlers[name]=handler;}});
  const list=element('div'),opened=[],installed=[{id:'notes',title,description:'Notes',version:'1.0.0'}];
  runInNewContext('let lastInstalledView;'+product.slice(producers[0].start,producers[0].end)+';renderInstalledTools();',{
    busy:false,installedReadError:false,enableReadError:'',enableRecords:{},installed,officialReleases:[],list,active:false,
    doc:{activeElement:null,createElement:element},sidebarToolEnabled:()=>true,openTool:id=>opened.push(id)});
  assert.equal(list.children.length,1);assert.equal(list.children[0].children.length,1);
  const open=list.children[0].children[0];assert.equal(open.tag,'button');
  assert.deepEqual(open.dataset,{sidebarToolId:'notes',sidebarToolAction:'open'});
  assert.equal(open.attributes['aria-label'],'打开工具「'+title+'」的详情');
  open.handlers.click();assert.deepEqual(opened,['notes']);
  for(const names of [[title,'React','Vue'],['React',title,'Vue'],['React','Vue',title]]){
    const index=names.indexOf(title);
    assert.deepEqual(inspect(names,true),{close:'#sidebar-tool-back',open:'#sidebar-tool-list button[data-sidebar-tool-action="open"][data-sidebar-tool-id="tool-'+index+'"]'});
  }
});

test('native tool navigation retains the recorded legacy tabs while identifying notes by title',()=>{
  assert.deepEqual(inspect(['任务列表','React',title],false),{close:'#sidebar-tool-tabs button:first-child',open:'#sidebar-tool-tabs button:nth-child(3)'});
});

test('native tool navigation rejects absent or ambiguous notes before sending input',()=>{
  for(const modern of [true,false])for(const names of [[],['React'],[title,title]])
    assert.throws(()=>inspect(names,modern),/Exactly one installed acceptance notes tool required/);
});

test('native tool navigation rejects ambiguous controls and malformed IDs before input',()=>{
  assert.throws(()=>inspect([title],true,{duplicateOpen:true}),/Exactly one installed acceptance open control required/);
  assert.throws(()=>inspect([title],true,{ids:['bad"selector']}),/Invalid installed acceptance tool ID/);
  assert.throws(()=>inspect([title,'React'],true,{ids:['same-id','same-id']}),/Exactly one installed acceptance open control required/);
});
