#!/usr/bin/env node
// R3.5 audit: inspect the approved HTML and the already-built official React
// product. No third UI, no privileged SDK, no destructive browser actions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url));
const approvedPath=resolve(here,'../cookie-editor.html');
const reactPath=join(here,'index.html');
const contract=JSON.parse(await readFile(join(here,'visual-contract.json'),'utf8'));
const originalBytes=await readFile(approvedPath);
const gitBlob=createHash('sha1').update('blob '+originalBytes.length+'\0').update(originalBytes).digest('hex');
if(gitBlob!==contract.approvedHtml.gitBlobSha)throw Error('E_APPROVED_HTML_CHANGED: '+gitBlob);
let previewCheck='';
try{
 previewCheck=execFileSync(process.execPath,[join(here,'build-preview.mjs'),'--check'],
   {cwd:here,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(!previewCheck.includes('R520_PREVIEW_MATCH'))throw Error('missing preview SHA readback');
}catch(cause){
 throw Error('E_R35_REACT_PREVIEW_STALE: rebuild with existing official pipeline before audit; '+
   String(cause.stderr||cause.message).slice(0,450));
}
const enforce=process.argv.includes('--enforce');
const all=process.argv.includes('--all');
const theme=process.argv.includes('--dark')?'dark':'light';
const widths=all?[320,360,380,400,440,520]:[380];
const tabs=process.argv.includes('--g1')?['cookie','accounts']:
  ['cookie','accounts','enterprise','market','custom','circle'];
const output=resolve(here,'../../../../../artifacts/cookie-editor-r35-visual');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
const diffs=[],screenshots=[],errors=[];
const styleKeys=['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor',
  'borderTopColor','borderBottomColor','borderTopWidth','borderRadius',
  'paddingTop','paddingBottom','paddingLeft','paddingRight',
  'whiteSpace','textOverflow','width','height'];
const normalize=(value)=>typeof value==='string'?value.trim().replace(/\s+/g,' '):value;
const near=(left,right,key)=>{
  if(left===right)return true;
  if(/^(width|height|padding|borderTopWidth)/i.test(key)){
    const a=Number.parseFloat(left),b=Number.parseFloat(right);
    return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1;
  }
  return false;
};
async function sample(page,selector,icon=false){
 const node=page.locator(selector).first();
 if(await node.count()===0||!(await node.isVisible()))return {missing:true};
 return node.evaluate((el,args)=>{
   const style=getComputedStyle(el),box=el.getBoundingClientRect();
   const result={style:{},geometry:{x:box.x,y:box.y,width:box.width,height:box.height}};
   for(const key of args.keys)result.style[key]=style[key];
   if(args.icon){
     result.icon={
       svg:el.tagName.toLowerCase()==='svg',
       paths:[...el.querySelectorAll('path')].map(p=>p.getAttribute('d')),
       geometry:[...el.querySelectorAll('circle,rect,line,polyline,polygon,ellipse')].map(p=>p.outerHTML)
     };
   }
   return result;
 },{keys:styleKeys,icon});
}
async function textValue(page,record,side){
 const node=page.locator(record[side]).first();
 if(await node.count()===0)return null;
 return normalize(record.attr?await node.getAttribute(record.attr):await node.textContent());
}
async function overflow(page,selector){
 return page.locator(selector).first().evaluate(el=>({
   scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,
   clientHeight:el.clientHeight
 }));
}
try{
 for(const width of widths){
  const context=await browser.newContext({viewport:{width:Math.max(620,width+70),height:900},deviceScaleFactor:1});
  const [oldPage,reactPage]=await Promise.all([context.newPage(),context.newPage()]);
  oldPage.setDefaultTimeout(10000);
  reactPage.setDefaultTimeout(10000);
  for(const page of [oldPage,reactPage])page.on('pageerror',error=>errors.push({width,message:error.message}));
  await oldPage.goto(pathToFileURL(approvedPath).href,{waitUntil:'load'});
  await oldPage.locator('#labWidth').selectOption(String(width));
  await reactPage.goto(pathToFileURL(reactPath).href,{waitUntil:'load'});
  await reactPage.locator('.row-trigger').first().waitFor({state:'visible'});
  if(width!==380){
    await reactPage.locator('.demo-lab>summary').click();
    await reactPage.getByTestId('width').selectOption(String(width));
  }
  if(theme==='dark'){
    await oldPage.locator('#labTheme').click();
    if(await reactPage.locator('.demo-lab').getAttribute('open')===null)
      await reactPage.locator('.demo-lab>summary').click();
    await reactPage.getByRole('button',{name:'深色',exact:true}).click();
  }
  const tabLabels={accounts:'Accounts',enterprise:'Enterprise',market:'Market',
    custom:'Custom',circle:'Circle'};
  for(const tab of tabs){
   console.log(JSON.stringify({audit:'R35_VISUAL_SCENE',width,theme,tab}));
   if(tab!=='cookie'){
     await oldPage.locator('#tab'+tabLabels[tab]).click();
     await reactPage.locator('#cookie-product-tab-'+tab).click();
     await oldPage.locator('#view'+(tab==='cookie'?'Cookies':tabLabels[tab])).waitFor({state:'visible'});
     await reactPage.locator('#cookie-product-panel-'+tab).waitFor({state:'visible'});
   }
   const layout=contract.layoutOrder?.[tab];
   if(layout){
     for(const [origin,page] of [['html',oldPage],['react',reactPage]]){
       const points=[];
       for(const selector of layout[origin]){
         const element=page.locator(selector).first();
         const box=await element.boundingBox();
         points.push({selector,y:box?.y??null});
       }
       if(points.some(item=>item.y===null)||points.some((item,i)=>i>0&&item.y+1<points[i-1].y))
         diffs.push({width,theme,tab,id:origin+'-section-order',status:'LOCKED',
           kind:'STRUCTURE_ORDER',points});
     }
   }
   const empty=await reactPage.locator('.cookie-editor-react svg').evaluateAll(nodes=>
     nodes.filter(node=>!node.querySelector('path,circle,rect,line,polyline,polygon,ellipse'))
       .map(node=>node.outerHTML.slice(0,220)));
   if(empty.length)diffs.push({width,theme,tab,id:'empty-svg',status:'LOCKED',
     kind:'EMPTY_REACT_SVG',count:empty.length,elements:empty});
   const selectors=contract.elements.filter(item=>item.tab===tab);
   for(const item of selectors){
    const [html,react]=await Promise.all([sample(oldPage,item.html,item.icon),sample(reactPage,item.react,item.icon)]);
    if(html.missing||react.missing){
      diffs.push({width,theme,tab,id:item.id,status:item.status,kind:'MISSING_ELEMENT',
        html,react,source:item.source,css:item.css});continue;
    }
    for(const key of item.compare){
      const oldValue=html.style[key],newValue=react.style[key];
      if(!near(oldValue,newValue,key)){
       diffs.push({width,theme,tab,id:item.id,status:item.status,kind:'COMPUTED_STYLE',
         property:key,html:oldValue,react:newValue,source:item.source,css:item.css});
      }
    }
    if(item.icon){
      if(!react.icon.svg||!react.icon.paths.length&&!react.icon.geometry.length)
        diffs.push({width,theme,tab,id:item.id,status:item.status,kind:'EMPTY_REACT_SVG',source:item.source});
      else if(JSON.stringify(html.icon)!==JSON.stringify(react.icon))
        diffs.push({width,theme,tab,id:item.id,status:item.status,kind:'ICON_PATH_DIFFERENCE',
          html:html.icon,react:react.icon,source:item.source});
    }
   }
   for(const item of contract.staticText.filter(x=>x.tab===tab)){
    const [html,react]=await Promise.all([textValue(oldPage,item,'html'),textValue(reactPage,item,'react')]);
    if(html===null||react===null||!(item.value?html===item.value&&react===item.value:
      html.includes(item.contains)&&react.includes(item.contains))){
       diffs.push({width,theme,tab,id:item.id,status:item.status,kind:'STATIC_COPY',html,react,
         expected:item.value||item.contains});
    }
   }
   for(const [name,page,selector] of [['html',oldPage,'#panel'],['react',reactPage,'.cookie-app']]){
    const data=await overflow(page,selector);
    if(data.scrollWidth>data.clientWidth+1)
      diffs.push({width,theme,tab,id:name+'-container',status:'LOCKED',kind:'HORIZONTAL_OVERFLOW',data});
    const path=join(output,width+'-'+theme+'-'+tab+'-'+name+'.png');
    // Element screenshot waits for layout "stability"; the approved prototype
    // contains animated interactions. Sample actual bounds and screenshot
    // the page clip without waiting for unrelated animations to settle.
    try{
      const rect=await page.locator(selector).first().boundingBox();
      const viewport=page.viewportSize();
      if(!rect||!viewport)throw Error('missing screenshot bounds');
      const x=Math.max(0,rect.x),y=Math.max(0,rect.y);
      const crop={x,y,width:Math.min(rect.width,viewport.width-x),
        height:Math.min(rect.height,viewport.height-y)};
      if(crop.width<=0||crop.height<=0)throw Error('screenshot outside viewport');
      // CDP captures the same real Chromium compositor frame without Playwright's
      // unrelated animation/font-stability wait on the approved prototype.
      const session=await context.newCDPSession(page);
      try{
        const result=await session.send('Page.captureScreenshot',{
          format:'png',fromSurface:true,
          clip:{x:crop.x,y:crop.y,width:crop.width,height:crop.height,scale:1}
        });
        await writeFile(path,Buffer.from(result.data,'base64'));
      }finally{await session.detach();}
      screenshots.push(path);
    }catch(error){
      const message=String(error?.message||error);
      errors.push({width,tab,page:name,message});
      diffs.push({width,theme,tab,id:name+'-screenshot',status:'LOCKED',
        kind:'TEST_INFRA_FAIL',message});
    }
   }
   // Checkpoint every completed width/tab; runner cancellation must not erase
   // evidence from prior scenes. Do not report browser infra as visual parity.
   await writeFile(join(output,'scene-'+width+'-'+theme+'-'+tab+'.json'),
     JSON.stringify({width,theme,tab,
       status:errors.some(x=>x.width===width&&x.tab===tab)?'TEST_INFRA_FAIL':
         diffs.some(x=>x.width===width&&x.tab===tab&&x.status==='LOCKED')?'VISUAL_GAP':'REVIEW_REQUIRED',
       diffs:diffs.filter(x=>x.width===width&&x.tab===tab),
       errors:errors.filter(x=>x.width===width&&x.tab===tab),
       screenshots:screenshots.filter(x=>x.includes(width+'-'+theme+'-'+tab+'-'))},null,2)+'\n');
  }
  await context.close();
 }
}finally{await browser.close();}
const report={schema:contract.schema,approvedGitBlob:gitBlob,
  builtReactSource:'CHECKED_BY_EXISTING_BUILD_PREVIEW',theme,widths,
  notes:['Run npm run build and build-preview.mjs --check before this audit.',
    'Screenshots are from two real files, not a composite replacement UI.',
    'Genuine browser 200% zoom, Mac Chrome Host permissions and real Cookie operations require separate tests.',
    'Token color differences are reported, not silently waived.'],
  status:diffs.some(x=>x.status==='LOCKED')?'GAP':'REVIEW_REQUIRED',
  counts:{total:diffs.length,locked:diffs.filter(x=>x.status==='LOCKED').length,
    missing:diffs.filter(x=>x.kind==='MISSING_ELEMENT').length,
    emptyIcons:diffs.filter(x=>x.kind==='EMPTY_REACT_SVG').length},
  diffs,errors,screenshots,exceptions:contract.exceptions};
await writeFile(join(output,'report-'+theme+'-'+(all?'all':'380')+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,report:join(output,'report-'+theme+'-'+(all?'all':'380')+'.json'),
 counts:report.counts,errors:errors.length,
 exampleDiffs:diffs.slice(0,16).map(({width,tab,id,kind,property,html,react,source,css})=>
   ({width,tab,id,kind,property,html,react,source,css}))},null,2));
if(enforce&&(report.counts.locked||errors.length))process.exitCode=1;
