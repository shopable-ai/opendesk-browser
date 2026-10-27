#!/usr/bin/env node
// R3.5 audit: inspect the approved HTML and the already-built official React
// product. No third UI, no privileged SDK, no destructive browser actions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const here=dirname(fileURLToPath(import.meta.url));
const approvedPath=resolve(here,'../cookie-editor.html');
const reactPath=join(here,'index.html');
const contract=JSON.parse(await readFile(join(here,'visual-contract.json'),'utf8'));
const originalBytes=await readFile(approvedPath);
const gitBlob=createHash('sha1').update('blob '+originalBytes.length+'\0').update(originalBytes).digest('hex');
if(gitBlob!==contract.approvedHtml.gitBlobSha)throw Error('E_APPROVED_HTML_CHANGED: '+gitBlob);
const enforce=process.argv.includes('--enforce');
const all=process.argv.includes('--all');
const theme=process.argv.includes('--dark')?'dark':'light';
const widths=all?[320,360,380,400,440,520]:[380];
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
    await reactPage.getByRole('button',{name:'深色',exact:true}).click();
  }
  for(const tab of ['cookie','accounts']){
   if(tab==='accounts'){
     await oldPage.locator('#tabAccounts').click();
     await reactPage.locator('#cookie-product-tab-accounts').click();
   }
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
    await page.locator(selector).screenshot({path});
    screenshots.push(path);
   }
  }
  await context.close();
 }
}finally{await browser.close();}
const report={schema:contract.schema,approvedGitBlob:gitBlob,
  builtReactSource:'UNVERIFIED_BY_THIS_SCRIPT',theme,widths,
  notes:['Run npm run build and build-preview.mjs --check before this audit.',
    'Screenshots are from two real files, not a composite replacement UI.',
    'Genuine browser 200% zoom, Mac Chrome Host permissions and real Cookie operations require separate tests.',
    'Token color differences are reported, not silently waived.'],
  status:diffs.some(x=>x.status==='LOCKED')?'GAP':'REVIEW_REQUIRED',
  counts:{total:diffs.length,locked:diffs.filter(x=>x.status==='LOCKED').length,
    missing:diffs.filter(x=>x.kind==='MISSING_ELEMENT').length,
    emptyIcons:diffs.filter(x=>x.kind==='EMPTY_REACT_SVG').length},
  diffs,errors,screenshots,exceptions:contract.exceptions};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,report:join(output,'report.json'),counts:report.counts,errors:errors.length},null,2));
if(enforce&&(report.counts.locked||errors.length))process.exitCode=1;
