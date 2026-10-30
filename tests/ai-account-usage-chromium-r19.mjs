// Runs ONLY against preview-dist, which is bundled from the formal web/main.jsx.
// Intentionally no real account credentials, local management service or remote HTTP.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';

const root=resolve('services/ai-account-usage/web/preview-dist');
const evidence=resolve('artifacts/ai-usage-r19');
await mkdir(evidence,{recursive:true});
const assetTypes={'/':'text/html','/index.html':'text/html','/app.js':'text/javascript','/app.css':'text/css'};
const assetNames={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/app.css':'app.css'};
const server=createServer(async(req,res)=>{
  const name=assetNames[req.url];
  if(!name){res.writeHead(404);res.end();return;}
  try{const body=await readFile(join(root,name));res.writeHead(200,
    {'content-type':assetTypes[req.url]+'; charset=utf-8','cache-control':'no-store'});res.end(body);}
  catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const issues=[],checks=[];
const check=(name,passed,details=null)=>{
  checks.push({name,passed,details});
  assert.ok(passed,name+': '+JSON.stringify(details));
};
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  const base=`http://127.0.0.1:${server.address().port}/`;
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>issues.push(error.message));
  await page.goto(base,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelectorAll('.accounts tbody tr').length===10 &&
    document.querySelectorAll('.bar-btn').length>=7);
  check('10 demo accounts from formal React',await page.locator('.accounts tbody tr').count()===10);
  check('demo is visibly labelled',await page.getByText('虚构数据 · 交互预览 · 不连接真实账号').count()===1);
  check('no failed live HTTP auth attempts',await page.locator('.accounts').count()===1);
  await page.screenshot({path:join(evidence,'1440-account-overview.png'),fullPage:true});
  const spare=page.locator('tr').filter({hasText:'备用 Pro'});
  check('spare pro decision',await spare.getByText('值得关注').count()===1);
  await spare.getByRole('button',{name:/查看.*历史证据/}).click();
  await page.locator('dialog.drawer[open]').waitFor();
  await page.getByRole('button',{name:'20 次',exact:true}).click();
  check('20-cycle display switch',await page.getByRole('button',{name:'20 次',exact:true}).getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'7 次',exact:true}).click();
  await page.locator('.drawer .bar-btn:not([disabled])').last().click();
  check('clicked bar has selected evidence',await page.getByText('所选柱子的历史证据').count()===1);
  await page.locator('dialog.drawer').screenshot({path:join(evidence,'spare-pro-history.png')});
  await page.keyboard.press('Escape');
  check('Escape closes drawer',await page.locator('dialog.drawer[open]').count()===0);
  check('focus restored after drawer',await spare.getByRole('button',{name:/查看.*历史证据/}).evaluate(
    el=>document.activeElement===el));
  await spare.locator('.bar-btn:not([disabled])').last().click();
  await page.locator('dialog.drawer[open]').waitFor();
  await page.locator('.drawer .bar-btn[aria-pressed="true"]').waitFor();
  check('clicking a table mini-bar selects exact historical cycle',
    await page.locator('.drawer .bar-btn[aria-pressed="true"]').count()===1);
  await page.keyboard.press('Escape');
  const business=page.locator('tr').filter({hasText:'企业工作区'});
  await business.getByRole('button',{name:/官方工作区邀请指引/}).click();
  await page.locator('dialog.invite[open]').waitFor();
  check('invite cannot fabricate success',await page.getByText('尚未发起邀请').count()===1);
  await page.locator('dialog.invite').screenshot({path:join(evidence,'business-invite-guidance.png')});
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('搜索账号、邮箱、别名…').fill('sample4');
  check('account search',await page.locator('.accounts tbody tr').count()===1);
  await page.getByPlaceholder('搜索账号、邮箱、别名…').fill('');
  await page.getByRole('button',{name:'长周期'}).click();
  check('window filter aria state',await page.getByRole('button',{name:'长周期'}).getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'可用窗口'}).click();
  const statusFilter=page.locator('.controls select').first();
  await statusFilter.selectOption('attention');
  await page.waitForFunction(()=>document.querySelectorAll('.accounts tbody tr').length===5);
  check('attention status filter narrows to five review candidates',
    await page.locator('.accounts tbody tr').count()===5);
  await statusFilter.selectOption('all');
  await page.waitForFunction(()=>document.querySelectorAll('.accounts tbody tr').length===10);
  const sorting=page.locator('.controls select').nth(1);
  await sorting.selectOption('name');
  await page.waitForFunction(()=>{const n=[...document.querySelectorAll('.account-name')].map(x=>x.textContent);return n.every((v,i)=>i===0||n[i-1].localeCompare(v,'zh-CN')<=0)});
  const ordered=await page.locator('.account-name').allTextContents();
  check('account name sorting uses visible locale collation',
    ordered.every((name,i)=>i===0||ordered[i-1].localeCompare(name,'zh-CN')<=0));
  await sorting.selectOption('attention');
  for (const width of [320,360,390,400,440,520,1440]) {
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(60);
    const result=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
    check(`responsive no page overflow at ${width}`,result.documentWidth<=result.viewport+1,result);
    if(width===390){
      const card=await page.locator('.accounts tbody tr').first().evaluate(el=>{
        const row=el.getBoundingClientRect();
        const identity=el.querySelector('.col-id').getBoundingClientRect();
        const chart=el.querySelector('.col-chart').getBoundingClientRect();
        return {rowWidth:row.width, identityWidth:identity.width, chartWidth:chart.width, rowHeight:row.height};
      });
      check('390px card fills available width instead of inheriting desktop column percentages',
        card.identityWidth>=card.rowWidth*0.72 && card.chartWidth>=card.rowWidth*0.72,card);
      check('390px card density stays readable rather than a 500px text column',card.rowHeight<390,card);
      await page.screenshot({path:join(evidence,'390-mobile.png'),fullPage:true});
    }
  }
  await page.setViewportSize({width:390,height:900});
  await page.evaluate(()=>document.documentElement.style.zoom='200%');
  const zoom=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
  check('200% zoom no page horizontal overflow',zoom.documentWidth<=zoom.viewport+1,zoom);
  check('no browser script errors',issues.length===0,issues);
  const js=await readFile(join(root,'app.js'));
  const css=await readFile(join(root,'app.css'));
  const report={result:'CHROMIUM_PASS',source:'services/ai-account-usage/web/main.jsx',
    scriptSHA256:createHash('sha256').update(js).digest('hex'),
    cssSHA256:createHash('sha256').update(css).digest('hex'),
    browserVersion:await browser.version(),checks,issues};
  await writeFile(join(evidence,'chromium-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('R19_CHROMIUM',JSON.stringify({browserVersion:report.browserVersion,passed:checks.length,screenshots:4}));
} catch(error) {
  const report={result:'CHROMIUM_FAIL',error:String(error.message||error),checks,issues};
  await writeFile(join(evidence,'chromium-report.json'),JSON.stringify(report,null,2)+'\n');
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
