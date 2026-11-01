// Optional browser driver; supply PLAYWRIGHT_MODULE when not installed locally.
// This exercises only the offline HTML and memory SDK, never an extension.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {exercisePreview,exerciseButtonFeedback} from './preview-interactions.mjs';
import {exerciseAiDock} from './ai-dock-interactions.mjs';
import {exerciseLibraryColumns,exerciseLibraryStates} from './library-columns-interactions.mjs';
import {exerciseControls} from './controls-interactions.mjs';
import {exerciseLibraryDesign} from './library-design-interactions.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dockOnly=process.argv.includes('--ai-dock');
const buttonsOnly=process.argv.includes('--buttons');
const libraryOnly=process.argv.includes('--library-columns');
const statesOnly=process.argv.includes('--library-states');
const controlsOnly=process.argv.includes('--controls');
const libraryDesignOnly=process.argv.includes('--library-design');
const args=process.argv.slice(2).filter(arg=>!['--ai-dock','--buttons','--library-columns','--library-states','--controls','--library-design'].includes(arg));
const url=args[0]||pathToFileURL(resolve('examples/sidebar-tools/scrapyjs/preview/preview.html')).href;
const out=resolve(args[1]||'artifacts/scrapyjs/ui-preview-20261031');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const page=await browser.newPage({viewport:{width:1200,height:1120},colorScheme:'light',reducedMotion:'reduce'});
const report={url,kind:'OFFLINE_REACT_UI_SIMULATED_SDK',scope:libraryDesignOnly?'LIBRARY_DESIGN':controlsOnly?'RULES_JSON_CONFIRM_RUN_CONTROLS':libraryOnly?'LIBRARY_COLUMNS':statesOnly?'LIBRARY_RESULT_STATES':buttonsOnly?'BUTTON_FEEDBACK':dockOnly?'AI_DOCK_CHANGE_ONLY':'FULL_PREVIEW',browserVersion:browser.version(),platform:process.platform,nativeChrome:'NOT_TESTED',screenshots:[],errors:[]};
if(libraryOnly||statesOnly||controlsOnly||libraryDesignOnly){
  page.setDefaultTimeout(8000);page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
}
try{
  const shot=async name=>{const path=join(out,name+'.png');await page.locator('.preview-device').screenshot({path});report.screenshots.push(path);};
  if(libraryOnly||statesOnly||controlsOnly||libraryDesignOnly){
    report.interactions=await (libraryDesignOnly?exerciseLibraryDesign:controlsOnly?exerciseControls:statesOnly?exerciseLibraryStates:exerciseLibraryColumns)(page,url,{screenshot:shot});
    if(report.errors.length)throw Error(report.errors.join('\n'));
  }else if(buttonsOnly){
    report.interactions=await exerciseButtonFeedback(page,url);
  }else if(dockOnly){
    report.interactions=await exerciseAiDock(page,url,{screenshot:shot});
  }else{
  await page.goto(url);
  const frame=page.frameLocator('#opendesk-preview-frame');
  await frame.locator('#profile-list option[value="demo"]').waitFor({state:'attached'});
  await shot('ready');
  await frame.locator('#start').click();await frame.locator('#run-summary').filter({hasText:'采集完成'}).waitFor();
  await shot('results');
  await frame.getByRole('button',{name:'打开第 1 条完整记录',exact:true}).click();await shot('record-detail');
  await frame.locator('#record-detail-text').press('Escape');
  await frame.locator('#tab-rules').click();await frame.locator('[data-field-key="title"]').click();await shot('rules');
  await frame.locator('#tab-json').click();await shot('json');
  await page.locator('#sidebar-tool-conversation-toggle').click();await frame.locator('#ai-requirement').fill('增加与 title 相同的 column_title 字段');
  await frame.locator('#ai-use-page').check();await frame.locator('#ai-generate').click();
  await frame.locator('#ai-review').waitFor();await shot('ai-review');
  report.presentation=await frame.locator('.capture-app').evaluate(app=>{
    const css=getComputedStyle(app),visible=[...app.querySelectorAll('button,input,select,textarea')].filter(el=>el.getClientRects().length);
    return {gutter:css.padding,gap:css.gap,font:getComputedStyle(document.body).font,
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
      unlabeledControls:visible.filter(el=>!el.textContent?.trim()&&!el.getAttribute('aria-label')&&!el.id).map(el=>el.tagName)};
  });
  for(const scenario of ['empty','error','loading','permission-denied','untrusted']){
    await page.goto(url);
    const picker=page.locator('#scrapyjs-preview-scenario');
    await page.locator('details').filter({has:picker}).locator('summary').click();
    await picker.selectOption(scenario);
    await frame.locator('#profile-list').waitFor();
    if(scenario==='permission-denied')await frame.locator('#app-error').filter({hasText:'权限不足'}).waitFor();
    else{
      await frame.locator('#start').click();
      await frame.locator('#run-summary').filter({hasText:scenario==='loading'?'正在采集':scenario==='error'?'采集失败':'采集完成'}).waitFor();
    }
    await shot(scenario);
  }
  report.interactions=await exercisePreview(page,url);
  }
  report.status='PASS_SIMULATED_UI';
}catch(error){report.status='FAIL';report.error=error.stack;await page.screenshot({path:join(out,'failure.png')});process.exitCode=1;}
finally{
  const bytes=url.startsWith('file:')?await readFile(new URL(url)):Buffer.from(await (await fetch(url)).arrayBuffer());
  report.previewSha256=createHash('sha256').update(bytes).digest('hex');
  report.screenshotHashes=Object.fromEntries(await Promise.all(report.screenshots.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();console.log(JSON.stringify(report,null,2));
}
