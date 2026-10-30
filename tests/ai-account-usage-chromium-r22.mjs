// Formal production React + synthetic same-origin API. No provider secrets or real upstream.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('services/ai-account-usage/web/dist');
const evidence=resolve('artifacts/ai-usage-r22');
await mkdir(evidence,{recursive:true});
const at=offset=>new Date(Date.now()+offset).toISOString();
const windowKey='codex:primary:18000';
const makeAccount=(alias,name,email,remaining)=>({
  alias,displayName:name,
  identity:{userId:'user-'+alias,accountId:'workspace-'+alias,email,
    emailSource:'USAGE_RESPONSE',displayName:null,displayNameSource:'UNKNOWN',observedAt:at(-120000)},
  providerPlan:{family:'PRO',code:'pro',source:'QUOTA_RESPONSE'},
  subscription:{tierLabel:'Pro',membershipExpiresAt:null,nextBillingAt:null,source:'UNKNOWN'},
  lastSuccessAt:at(-120000),lastAttempt:{status:'OK',mode:'CODEX_OAUTH',checkedAt:at(-120000)},
  windows:[{windowKey,limitId:'codex',durationSeconds:18000,slot:'primary',kind:'SHORT_WINDOW',
    remainingPercent:remaining,usedPercent:100-remaining,observedAt:at(-120000),resetsAt:at(18000000)}]
});
const accounts=[
  makeAccount('healthy_01','授权账号 A','authorized-a@example.test',57),
  makeAccount('healthy_02','授权账号 B','authorized-b@example.test',36)
];
const histories=Object.fromEntries(accounts.map(account=>[account.alias,{
  observations:[{...account.windows[0],accountAlias:account.alias}],
  rollovers:Array.from({length:7},(_,i)=>({
    accountAlias:account.alias,windowKey,type:'CROSSED_PREDICTED_RESET',
    priorResetsAt:at(-(8-i)*18000000),detectedAt:at(-(8-i)*18000000+120000),
    lastPreResetSampleAt:at(-(8-i)*18000000-300000),leadSeconds:300,
    nearResetUnusedEstimatePercent:account.alias==='healthy_01'?90:30,
    estimateQuality:'NEAR_RESET_OBSERVATION'
  }))
}]));
let mode='success',postCount=0,accountReads=0,historyReads=0;
let rejectDrawerReads=false,historyFault=false,accountFault=false;
const send=(res,status,payload)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(payload));};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const assets={'/app/':'index.html','/app/index.html':'index.html','/app/app.js':'app.js','/app/app.css':'app.css'};
  if(req.method==='GET' && assets[url.pathname]){
    try{const body=await readFile(join(root,assets[url.pathname]));
      res.writeHead(200,{'content-type':url.pathname.endsWith('css')?'text/css':url.pathname.endsWith('js')?'text/javascript':'text/html'});
      res.end(body);}catch{res.writeHead(500);res.end();}return;
  }
  if(req.method==='GET' && url.pathname==='/api/v1/accounts')return send(res,200,{accounts});
  const match=/^\/api\/v1\/accounts\/([A-Za-z0-9_-]+)(\/history|\/refresh)?$/.exec(url.pathname);
  if(!match)return send(res,404,{error:'NOT_FOUND'});
  const alias=match[1],which=match[2],account=accounts.find(a=>a.alias===alias);
  if(!account)return send(res,404,{error:'ACCOUNT_NOT_FOUND'});
  if(req.method==='GET' && !which){
    accountReads++;
    if(accountFault){accountFault=false;return send(res,503,{error:'READBACK_FAILED'});}
    return send(res,200,{account});
  }
  if(req.method==='GET' && which==='/history'){
    historyReads++;
    if(historyFault || (rejectDrawerReads && url.searchParams.get('limit')==='20'))
      return send(res,503,{error:'HISTORY_FAILED'});
    return send(res,200,histories[alias]);
  }
  if(req.method==='POST' && which==='/refresh'){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    if(Buffer.concat(chunks).toString()!=='{}')return send(res,400,{error:'BAD_INPUT'});
    postCount++;
    await new Promise(resolve=>setTimeout(resolve,100)); // Make repeated click race observable.
    if(mode==='rate-limit' || mode==='http200-error'){
      const status=mode==='rate-limit'?'RATE_LIMITED':'UNAVAILABLE';
      account.lastAttempt={status,mode:'CODEX_OAUTH',checkedAt:at(0)};
      return send(res,mode==='rate-limit'?429:200,{status,account});
    }
    const remaining=mode==='success-history-fail'?48:mode==='success-readback-fail'?43:52;
    const checkedAt=at(0);
    account.lastSuccessAt=checkedAt;
    account.lastAttempt={status:'OK',mode:'CODEX_OAUTH',checkedAt};
    account.windows=[{...account.windows[0],remainingPercent:remaining,usedPercent:100-remaining,observedAt:checkedAt}];
    histories[alias].observations.push({...account.windows[0],accountAlias:alias});
    if(mode==='success-history-fail')historyFault=true;
    if(mode==='success-readback-fail')accountFault=true;
    return send(res,200,{status:'OK',account});
  }
  return send(res,405,{error:'METHOD_NOT_ALLOWED'});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const checks=[],issues=[];
const check=(name,condition,detail=null)=>{checks.push({name,passed:!!condition,detail});assert.ok(condition,name+': '+JSON.stringify(detail));};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>issues.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/app/',{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelectorAll('.accounts tbody tr').length===2);
  const first=page.locator('.accounts tbody tr').filter({hasText:'授权账号 A'});
  const second=page.locator('.accounts tbody tr').filter({hasText:'授权账号 B'});
  const refresh=first.getByRole('button',{name:'手动刷新 授权账号 A 额度'});
  check('healthy unexpired account exposes enabled icon-only query',await refresh.isEnabled() &&
    await refresh.locator('svg').count()===1);
  check('page load never requests upstream',postCount===0);
  await first.getByText('值得关注').waitFor();
  const reliableBefore=await first.locator('.bar-btn:not([disabled])').count();
  check('reliable pre-reset history loaded',reliableBefore===7);
  const secondBefore=await second.locator('.quota-value').innerText();
  // Two synchronous clicks must produce exactly one POST despite React batching.
  await refresh.evaluate(element=>{element.click();element.click();});
  await first.getByText(/查询中…/).waitFor();
  check('query is visibly in progress and locked',await refresh.isDisabled());
  await first.getByText(/查询成功 ·/).waitFor();
  check('one POST, independently read account and history',postCount===1 && accountReads>=1 && historyReads>=3,
    {postCount,accountReads,historyReads});
  check('confirmed cache updated',await first.locator('.quota-value').innerText()==='52%');
  check('unrelated account remains intact',await second.locator('.quota-value').innerText()===secondBefore);
  const historyBeforeFailure=await first.locator('.bar-btn:not([disabled])').count();

  mode='rate-limit';
  await refresh.click();
  await first.getByText(/受到速率限制/).waitFor();
  check('HTTP 429 shows failure rather than success',postCount===2 &&
    await first.locator('.row-success').count()===0);
  check('HTTP 429 retains last success and historical evidence',await first.locator('.quota-value').innerText()==='52%' &&
    await first.locator('.bar-btn:not([disabled])').count()===historyBeforeFailure);

  mode='http200-error';
  await refresh.click();
  await first.getByText(/本次额度查询失败/).waitFor();
  check('HTTP 200 with business error is rejected',postCount===3 &&
    await first.locator('.quota-value').innerText()==='52%' &&
    await first.locator('.row-success').count()===0);

  mode='success-history-fail';
  await refresh.click();
  await first.getByText(/历史读回失败/).first().waitFor();
  check('successful usage survives history GET failure',postCount===4 &&
    await first.locator('.quota-value').innerText()==='48%');
  check('previous seven reliable history entries remain visible',await first.locator('.bar-btn:not([disabled])').count()===7 &&
    await first.getByText('值得关注').count()===1);
  rejectDrawerReads=true;
  await first.getByRole('button',{name:/查看.*历史证据/}).click();
  await page.locator('dialog.drawer[open]').waitFor();
  await page.getByText(/保留最后一次成功读取的可靠历史/).waitFor();
  check('drawer uses scoped history fallback without inventing zero',await page.locator('dialog.drawer .bar-btn:not([disabled])').count()===7);
  await page.keyboard.press('Escape');
  rejectDrawerReads=false;historyFault=false;

  mode='success-readback-fail';
  await refresh.click();
  await first.getByText(/独立读回未确认/).waitFor();
  check('readback error never claims UI query success',postCount===5 &&
    await first.locator('.row-success').count()===0 &&
    await first.locator('.quota-value').innerText()==='48%');
  check('isolated second account unchanged after all operations',
    await second.locator('.quota-value').innerText()===secondBefore);
  await page.screenshot({path:join(evidence,'production-refresh.png'),fullPage:true});
  check('no browser script errors',issues.length===0,issues);
  const report={result:'CHROMIUM_SIMULATED_PASS',checks,issues,postCount,
    source:'services/ai-account-usage/web/main.jsx',liveProviderRequests:0,
    browserVersion:await browser.version()};
  await writeFile(join(evidence,'production-refresh-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('R22_PRODUCTION_REFRESH_SIMULATION',JSON.stringify({passed:checks.length,postCount,
    browserVersion:report.browserVersion}));
}catch(error){
  await writeFile(join(evidence,'production-refresh-report.json'),JSON.stringify({
    result:'CHROMIUM_SIMULATED_FAIL',error:String(error.message||error),checks,issues
  },null,2)+'\n');throw error;
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
