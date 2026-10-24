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
