import sdk,{Scrapy,ChromeSpider,ChromeDownloaderMiddleware,ItemLoader,Item,Request,normalizeConfig} from '../engine/browser.js';
import {controlledPage} from '../adapters/page.js';
import {allowedUrl} from '../adapters/capture-policy.js';
export {allowedUrl} from '../adapters/capture-policy.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function validateCapture(config) {
  const keys=['url','itemConfig','waitForSelector','timeoutMs','nextPageSelector','maxPages','dedupeKey','detail','validation','fieldRequirements','processing'];
  if(!config||Array.isArray(config)||typeof config!=='object'||Object.keys(config).some(key=>!keys.includes(key)))fail('E_CAPTURE_CONFIG');
  allowedUrl(config.url);
  normalizeConfig(config.itemConfig);
  for(const key of ['waitForSelector','nextPageSelector'])if(config[key]!==undefined&&
    (typeof config[key]!=='string'||!config[key].trim()||config[key].length>1024||/^\(?\.?\//.test(config[key])))fail('E_CAPTURE_CSS_ONLY');
  if(!Number.isInteger(config.timeoutMs??30000)||(config.timeoutMs??30000)<1||(config.timeoutMs??30000)>60000)fail('E_CAPTURE_TIMEOUT');
  if(config.maxPages!==undefined&&(!Number.isInteger(config.maxPages)||config.maxPages<1||config.maxPages>10))fail('E_CAPTURE_PAGE_LIMIT');
  if(config.dedupeKey!==undefined&&(typeof config.dedupeKey!=='string'||!Object.hasOwn(config.itemConfig,config.dedupeKey)||config.dedupeKey.startsWith('_')))fail('E_CAPTURE_IDENTITY');
  if(config.validation!==undefined)sdk.AIConfig.BrowserValidation.validateConfig(config);
  if(config.fieldRequirements!==undefined&&config.validation===undefined)fail('E_CAPTURE_VALIDATION_REQUIRED');
  if(config.processing!==undefined)sdk.AIConfig.Processing.validate(config.processing,Object.keys(config.itemConfig).filter(key=>!key.startsWith('_')));
  if(config.detail!==undefined){
    const d=config.detail;
    if(!d||Array.isArray(d)||typeof d!=='object'||Object.keys(d).some(key=>!['urlField','identityField','itemConfig','waitForSelector','numberFields'].includes(key)))fail('E_CAPTURE_DETAIL');
    if(!Object.hasOwn(config.itemConfig,d.urlField)||!Object.hasOwn(config.itemConfig,d.identityField)||
      !Object.hasOwn(d.itemConfig||{},d.identityField)||[d.urlField,d.identityField].some(key=>typeof key!=='string'||key.startsWith('_')))fail('E_CAPTURE_DETAIL');
    normalizeConfig(d.itemConfig);
    if(Object.keys(d.itemConfig).some(key=>!key.startsWith('_')&&key!==d.identityField&&Object.hasOwn(config.itemConfig,key)))fail('E_CAPTURE_DETAIL_COLLISION');
    if(d.waitForSelector!==undefined&&(typeof d.waitForSelector!=='string'||!d.waitForSelector.trim()||d.waitForSelector.length>1024))fail('E_CAPTURE_DETAIL');
    if(d.numberFields!==undefined&&(!Array.isArray(d.numberFields)||d.numberFields.length>20||d.numberFields.some(key=>typeof key!=='string'||key.startsWith('_')||!Object.hasOwn(d.itemConfig,key))))fail('E_CAPTURE_DETAIL');
  }
  return config;
}

// Source Pipeline from scrapyJs/examples/list-detail/common.cjs#normalize.
export function decimalFields(fields) {
  return item=>{
    const row={...item};
    for(const key of fields){
      if(!/^\d+(?:\.\d{1,2})?$/.test(String(row[key])))fail('PRICE_FORMAT');
      row[key]=Number(row[key]);if(!Number.isFinite(row[key]))fail('PRICE_FORMAT');
    }
    return new Item(row);
  };
}

export async function runCapture(input,page,{pipeline}={}) {
  const config=validateCapture(clone(input));
  const facade=controlledPage(page),audit={listUrls:[],detailUrls:[],duplicates:0};
  class ControlledDownloader extends ChromeDownloaderMiddleware {
    async _ensurePage(){return facade;}
    shouldCaptureHtml(){return false;}
    async process_request(request,spider){
      allowedUrl(request.url);
      const response=await super.process_request(request,spider);
      allowedUrl(response.url);return response;
    }
  }
  const makeEngine=(list=false)=>new Scrapy({CONCURRENT_REQUESTS:1,CONCURRENT_REQUESTS_PER_DOMAIN:1,RETRY_TIMES:0,
    RANDOMIZE_DOWNLOAD_DELAY:false,
    ...(list&&config.nextPageSelector?{CLOSESPIDER_PAGECOUNT:config.maxPages??10}:{}),
    middlewares:[new ControlledDownloader({navigationTimeout:config.timeoutMs??30000})]});
  class ListSpider extends ChromeSpider {
    async *parse(response){
      for await(let item of super.parse(response)){
        const url=allowedUrl(await facade.url());
        if(!audit.listUrls.includes(url))audit.listUrls.push(url);
        if(config.detail){
          const base=await facade.evaluate(()=>document.baseURI);
          item=new Item({...item,[config.detail.urlField]:allowedUrl(item[config.detail.urlField],base)});
        }
        yield item;
      }
    }
  }
  const engine=makeEngine(true);
  const spider=new ListSpider({...config,name:'opendesk_capture',start_urls:[allowedUrl(config.url)],output:null,
    timeout:config.timeoutMs??30000,
    puppeteerConfig:{waitForSelector:config.waitForSelector,nextPageSelector:config.nextPageSelector,navigationTimeout:config.timeoutMs??30000}});
  spider.page=facade;engine.spider=spider;
  const seen=new Map();
  engine.addPipeline(item=>{
    const row={...item};
    const key=config.dedupeKey??config.detail?.identityField;
    if(key){
      if(typeof row[key]!=='string'||!row[key].trim())fail('E_CAPTURE_IDENTITY');
      if(seen.has(row[key])){
        if(JSON.stringify(seen.get(row[key]))!==JSON.stringify(row))fail('DUPLICATE_ID_CONFLICT');
        audit.duplicates++;return null;
      }
      seen.set(row[key],clone(row));
    }
    return new Item(row);
  });
  if(pipeline&&!config.detail)engine.addPipeline(pipeline);
  let data,listStats,listResult;
  try{
    data=await engine.start();listStats=engine.getRunStats();listResult=clone(engine.runResult);
    if(listResult.status!=='completed'&&!(listResult.status==='partial'&&listResult.stopReason==='page_limit'))fail('RUN_INCOMPLETE');
  }finally{await engine.release();}
  if(!Array.isArray(data))fail('E_CAPTURE_RESULT');
  if(!config.detail)return {data:clone(data),stats:listStats,engine:listResult,audit};

  // Two phases reuse original BaseSpider / Request / Scheduler. No Node HTTP or checkpoint store.
  const detail=config.detail,urls=new Set();
  if(data.length>100)fail('E_CAPTURE_DETAIL_LIMIT');
  for(const row of data){
    const url=allowedUrl(row[detail.urlField]);
    if(urls.has(url))fail('DETAIL_URL_SHARED');urls.add(url);
  }
  const detailEngine=makeEngine();
  class DetailSpider extends sdk.BaseSpider {
    start_requests(){return data.map(row=>new Request(row[detail.urlField],async function* (response){
      if(allowedUrl(response.url)!==row[detail.urlField])fail('DETAIL_URL_MISMATCH');
      audit.detailUrls.push(response.url);
      if(detail.waitForSelector)await facade.waitForSelector(detail.waitForSelector,{timeout:config.timeoutMs??30000});
      const records=ItemLoader.ensureArray(await ItemLoader.parse(facade,detail.itemConfig,false));
      if(records.length!==1||records[0][detail.identityField]!==row[detail.identityField])fail('DETAIL_MISMATCH');
      yield new Item({...row,...records[0]});
    }));}
  }
  detailEngine.spider=new DetailSpider({name:'opendesk_details',output:null});
  if(detail.numberFields?.length)detailEngine.addPipeline(decimalFields(detail.numberFields));
  if(pipeline)detailEngine.addPipeline(pipeline);
  try{
    const rows=await detailEngine.start();
    if(detailEngine.runResult.status!=='completed'||rows.length!==data.length)fail('RUN_INCOMPLETE');
    return {data:clone(rows),stats:detailEngine.getRunStats(),engine:clone(detailEngine.runResult),
      list:{stats:listStats,engine:listResult},audit};
  }finally{await detailEngine.release();}
}
