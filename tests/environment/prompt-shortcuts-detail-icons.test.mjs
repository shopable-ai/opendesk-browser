import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

// Exact installable UI in an isolated Chromium document; no installed extension, Host CSS,
// production build or real clipboard/storage permission is exercised here.
const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;
const project=new URL('../../projects/prompt-shortcuts/',import.meta.url);
test('detail text-button icons stay compact while copy/edit and keyboard focus work',{
  skip:modulePath?false:'NOT_TESTED: set OPENDESK_PLAYWRIGHT_MODULE to an existing Playwright module'
},async t=>{
  const {chromium}=await import(modulePath);
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
    ...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?
      {executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:400,height:800}});
  page.setDefaultTimeout(5000);
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  const pkg=await createSidebarToolPackage(fileURLToPath(project));
  const library=structuredClone(pkg.initialData.library);
  // Include line breaks, literal markup and enough text to catch truncation.
  const body='完整正文 <b>保持纯文本</b>\n'+ '中文与 Emoji 🧭 不应截断。'.repeat(30);
  library.items[0].body=body;
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="fixture-root">'+pkg.html+'</div>');
  await page.addStyleTag({content:pkg.css});
  await page.evaluate(library=>{
    window.fixture={library,copies:[],requests:[],navigation:[],states:[]};
    // Mock only the public Host/clipboard boundaries, execute unmodified UI JS.
    document.execCommand=command=>{
      if(command!=='copy')throw Error('Unexpected clipboard command');
      const buffer=document.querySelector('#ps-clipboard-buffer');
      window.fixture.copies.push(buffer.value.slice(buffer.selectionStart,buffer.selectionEnd));
      return true;
    };
    window.OpenDeskTool={root:document.querySelector('#fixture-root'),
      async request(op,payload){
        window.fixture.requests.push({op,payload});
        if(op==='storage.get'&&payload.key==='library')
          return {value:structuredClone(library),etag:'a'.repeat(64)};
        if(op==='analytics.report')return {};
        throw Error('Unexpected Host operation: '+op);
      },
      setState:state=>window.fixture.states.push(state),
      setNavigation:state=>{window.fixture.navigation.push(state);return true;}
    };
    window.OpenDeskSDK={browser:{launch:{consume:async()=>null}}};
  },library);
  for(const script of pkg.scripts||[])await page.addScriptTag({content:script.code});
  await page.addScriptTag({content:pkg.js});
  const card=page.locator('[data-action="detail"]').first();
  await card.click();
  assert.equal(await page.locator('#ps-detail-body').textContent(),body);
  await page.waitForFunction(()=>document.activeElement?.id==='ps-detail-body');
  assert.equal(await page.getByRole('region',{name:'完整提示词正文'}).count(),1);
  assert.equal(await page.locator('#ps-detail-body b').count(),0);

  for(const [id,label] of [['ps-detail-edit','编辑'],['ps-detail-copy','复制全文']]){
    assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),1);
    const button=await page.locator('#'+id).boundingBox();
    assert(button.height>=36&&button.height<=44,id+' keeps a compact, usable text-button height');
    const actual=await page.locator('#'+id+' svg').evaluate(svg=>{
      const style=getComputedStyle(svg),rect=svg.getBoundingClientRect();
      return {width:rect.width,height:rect.height,fill:style.fill,
        stroke:style.stroke,strokeWidth:style.strokeWidth,shrink:style.flexShrink,
        pointerEvents:style.pointerEvents,hidden:svg.getAttribute('aria-hidden'),
        focusable:svg.getAttribute('focusable')};
    });
    assert.equal(actual.width,18,id+' icon width');
    assert.equal(actual.height,18,id+' icon height');
    assert.equal(actual.fill,'none');
    assert.notEqual(actual.stroke,'none');
    assert.equal(actual.strokeWidth,'1.8px');
    assert.equal(actual.shrink,'0');
    assert.equal(actual.pointerEvents,'none');
    assert.equal(actual.hidden,'true');
    assert.equal(actual.focusable,'false');
  }
  if(process.env.OPENDESK_UI_EVIDENCE_DIR){
    await mkdir(process.env.OPENDESK_UI_EVIDENCE_DIR,{recursive:true});
    await page.screenshot({path:join(process.env.OPENDESK_UI_EVIDENCE_DIR,'prompt-detail.png'),fullPage:true});
  }
  await page.getByRole('button',{name:'复制全文',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.fixture.copies),[body]);
  assert.equal(await page.locator('#ps-clipboard-buffer').inputValue(),'');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'ps-detail-copy');
  assert.equal(await page.getByRole('status').filter({hasText:'已复制完整正文。'}).count(),1);
  await page.getByRole('button',{name:'编辑',exact:true}).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ps-body').inputValue(),body);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'ps-body');
  assert.equal(await page.evaluate(()=>window.fixture.states.at(-1).dirty),false,'opening edit is not dirty');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(await card.isVisible(),true);
  assert.equal(await card.evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ps-detail-body').textContent(),body);
  assert.equal(await page.locator('#ps-detail-copy svg').count(),1,'reopening cannot duplicate icons');
  assert.equal(await page.evaluate(()=>window.fixture.requests.some(row=>row.op==='storage.set')),false);
  assert.deepEqual(errors,[]);
});
