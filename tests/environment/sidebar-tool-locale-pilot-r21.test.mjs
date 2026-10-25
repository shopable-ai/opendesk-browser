import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createToolLocaleService,parseLocalePack} from '../../src/ui/sidebar-tools/locale-packs.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {createToolLocalization} from '../../src/ui/sidebar-tools/localization.js';

test('actual Reading TOC AI sample completes data import/reopen/partial/upgrade/removal without changing business data',async()=>{
  const root='examples/sidebar-tools/reading-toc/';
  const tool=JSON.parse(await readFile(root+'reading-toc.opendesk-tool.json','utf8'));
  const japanese=JSON.parse(await readFile(root+'languages/ja.opendesk-locale.json','utf8'));
  const original=tool.localization.messages['zh-CN'];
  const data={[SIDEBAR_TOOL_STORE]:[tool],business:{readingPosition:42,mode:'focus'},permission:{granted:true}};
  const before=structuredClone({business:data.business,permission:data.permission,tool});
  const api={storage:{local:{
    async get(key){return {[key]:structuredClone(data[key])};},
    async set(values){Object.assign(data,structuredClone(values));}
  }}};
  let queue=Promise.resolve();
  const lockManager={request(name,work){
    if(name.endsWith(':catalog'))return work();
    const next=queue.then(work);queue=next.catch(()=>{});return next;
  }};
  let service=createToolLocaleService({api,lockManager});await service.ready;
  try{
    // This checked-in sample was translated by Codex from the actual task's
    // source rows. Only the data service is exercised; this is not native UI.
    const task=service.exportTranslationTask(tool,'ja');
    assert.equal(task.translationKeys.length,Object.keys(original).length);
    for(const key of task.translationKeys){
      assert.equal(task.pack.messages[key].source,japanese.messages[key].source);
      task.pack.messages[key].text=japanese.messages[key].text;
    }
    assert.deepEqual(parseLocalePack(task.pack,tool),japanese);
    await service.install(task.pack,tool);
    assert.equal(service.getCatalog(tool,'en').messages.title,'読書目次');
    service.dispose();service=createToolLocaleService({api,lockManager});await service.ready;
    assert.equal(service.getToolLocale(tool.id),'ja');
    assert.equal(service.getCatalog(tool,'en').messages.refreshLabel,japanese.messages.refreshLabel.text);
    const partial=structuredClone(japanese);delete partial.messages.title;
    await service.install(partial,tool);
    assert.equal(service.getCatalog(tool,'en').messages.title,original.title);
    assert.equal(service.getCatalog(tool,'en').messages.refreshLabel,japanese.messages.refreshLabel.text);
    await service.install(japanese,tool);
    const upgraded={...tool,version:'1.0.11',localization:await createToolLocalization({sourceLocale:'zh-CN',
      messages:{'zh-CN':{...original,title:'更新后的阅读目录'}}})};
    data[SIDEBAR_TOOL_STORE]=[upgraded];await service.reload();
    assert.equal(service.getCatalog(upgraded,'en').messages.title,'更新后的阅读目录');
    assert.equal(service.getCatalog(upgraded,'en').messages.refreshLabel,japanese.messages.refreshLabel.text);
    await service.remove(tool.id,'ja');
    assert.equal(service.getCatalog(upgraded,'en').messages.refreshLabel,original.refreshLabel);
    assert.deepEqual(data.business,before.business);assert.deepEqual(data.permission,before.permission);
    assert.deepEqual(tool,before.tool,'locale mutations never re-sign or rewrite the package');
  }finally{service.dispose();}
});

test('Reading TOC 55-row Japanese sample fills only two missing translations and preserves same-language updates',async()=>{
  const root='examples/sidebar-tools/reading-toc/';
  const packagePath=root+'reading-toc.opendesk-tool.json';
  const packageBytes=await readFile(packagePath);
  const tool=JSON.parse(packageBytes.toString('utf8'));
  const japanese=JSON.parse(await readFile(root+'languages/ja.opendesk-locale.json','utf8'));
  const original=tool.localization.messages['zh-CN'];
  const [major,minor,patch]=tool.version.split('.').map(Number);
  assert.ok(major>1||(major===1&&(minor>0||(minor===0&&patch>=10))),
    'exercise the official Reading TOC 1.0.10+ package');
  assert.equal(Object.keys(original).length,55);
  assert.equal(Object.keys(japanese.messages).length,55);
  assert.deepEqual(parseLocalePack(japanese,tool),japanese);
  const missing=['title','refreshLabel'];
  const partial=structuredClone(japanese);
  for(const key of missing)delete partial.messages[key];
  assert.equal(Object.keys(partial.messages).length,53);
  const retainedBytes=Object.fromEntries(Object.entries(partial.messages)
    .map(([key,row])=>[key,Buffer.from(JSON.stringify(row),'utf8')]));
  const data={[SIDEBAR_TOOL_STORE]:[tool],business:{readingPosition:42,mode:'focus'},permission:{granted:true}};
  const before=structuredClone(data);
  const api={storage:{local:{
    async get(key){return {[key]:structuredClone(data[key])};},
    async set(values){Object.assign(data,structuredClone(values));}
  }}};
  let queue=Promise.resolve();
  const lockManager={request(name,work){
    if(name.endsWith(':catalog'))return work();
    const next=queue.then(work);queue=next.catch(()=>{});return next;
  }};
  let service=createToolLocaleService({api,lockManager});await service.ready;
  let unsubscribe=()=>{};
  try{
    // Real package/sample data through the existing Node service fixture only;
    // this does not exercise Chrome extension UI or native installation.
    await service.install(partial,tool);
    assert.equal(service.getToolLocale(tool.id),'ja');
    const catalog=service.getCatalog(tool,'en');
    assert.deepEqual([...catalog.missing].sort(),[...missing].sort());
    for(const key of missing)assert.equal(catalog.messages[key],original[key],key+' falls back individually');
    for(const key of Object.keys(partial.messages))assert.equal(catalog.messages[key],japanese.messages[key].text);

    const savedPartial=structuredClone(data);
    const task=service.exportTranslationTask(tool,'ja');
    assert.deepEqual([...task.translationKeys].sort(),[...missing].sort());
    assert.equal(Object.keys(task.pack.messages).length,55);
    for(const [key,bytes] of Object.entries(retainedBytes))
      assert.deepEqual(Buffer.from(JSON.stringify(task.pack.messages[key]),'utf8'),bytes,key+' export preserves row bytes');
    for(const key of missing)assert.deepEqual(task.pack.messages[key],{source:original[key],text:original[key]});
    assert.deepEqual(data,savedPartial,'export does not mutate saved records');

    const response=JSON.parse(JSON.stringify(task.pack));
    for(const key of task.translationKeys)response.messages[key].text=japanese.messages[key].text;
    for(const [key,bytes] of Object.entries(retainedBytes))
      assert.deepEqual(Buffer.from(JSON.stringify(response.messages[key]),'utf8'),bytes,key+' response preserves row bytes');
    assert.deepEqual(response,japanese);
    await service.install(JSON.stringify(response),tool);
    assert.deepEqual(service.exportPack(tool.id,'ja'),japanese);
    service.dispose();service=createToolLocaleService({api,lockManager});await service.ready;
    assert.equal(service.getToolLocale(tool.id),'ja');
    assert.deepEqual(service.getCatalog(tool,'en').missing,[]);
    assert.deepEqual(service.getCatalog(tool,'en').messages,
      Object.fromEntries(Object.entries(japanese.messages).map(([key,row])=>[key,row.text])));
    assert.deepEqual(service.exportPack(tool.id,'ja'),japanese,'all 55 rows survive service reopening');

    const updated=service.exportPack(tool.id,'ja');
    updated.messages.title.text='更新した読書目次';
    const notices=[];
    unsubscribe=service.subscribe(state=>notices.push({state,catalog:service.getCatalog(tool,'en')}));
    await service.install(updated,tool);
    assert.ok(notices.length>0,'same-ja import notifies subscribers');
    const latest=notices.at(-1);
    assert.equal(latest.state.status,'ready');
    assert.equal(latest.state.tools[tool.id].locale,'ja');
    assert.deepEqual(latest.state.tools[tool.id].packs.ja,updated);
    assert.equal(latest.catalog.messages.title,updated.messages.title.text);
    assert.deepEqual(latest.catalog.missing,[]);
    for(const key of Object.keys(japanese.messages).filter(key=>key!=='title'))
      assert.equal(latest.catalog.messages[key],japanese.messages[key].text,key+' survives same-language update');
    assert.deepEqual(service.exportPack(tool.id,'ja'),updated);
    assert.deepEqual(data.business,before.business);
    assert.deepEqual(data.permission,before.permission);
    assert.deepEqual(data[SIDEBAR_TOOL_STORE],before[SIDEBAR_TOOL_STORE],'installed tool records stay unchanged');
    assert.deepEqual(tool,before[SIDEBAR_TOOL_STORE][0]);
    assert.deepEqual(await readFile(packagePath),packageBytes,'official package bytes stay unchanged');
  }finally{unsubscribe();service.dispose();}
});
