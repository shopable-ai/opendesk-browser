import {Scrapy,ChromeSpider,ChromeDownloaderMiddleware,normalizeConfig} from '../engine/browser.js';
import {controlledPage} from '../adapters/page.js';

export default async function main() {
  const input=params;
  if (!input || typeof input.configJson !== 'string' || input.configJson.length>4096) throw new Error('E_CAPTURE_CONFIG');
  const itemConfig=JSON.parse(input.configJson);
  const target=new URL(input.url);
  if (target.origin!=='http://127.0.0.1:43111' || target.username || target.password) throw new Error('E_CAPTURE_ORIGIN');
  if (!itemConfig || Array.isArray(itemConfig) || typeof itemConfig!=='object') throw new Error('E_CAPTURE_CONFIG');
  normalizeConfig(itemConfig); // Real SDK grammar, before navigation.
  const facade=controlledPage(page);
  class ControlledDownloader extends ChromeDownloaderMiddleware {
    // goto owns navigation; the old waitForNavigation check was unused.
    async _ensurePage() { return facade; }
    shouldCaptureHtml() { return false; }
  }
  const engine=new Scrapy({
    CONCURRENT_REQUESTS:1,CONCURRENT_REQUESTS_PER_DOMAIN:1,RETRY_TIMES:0,
    RANDOMIZE_DOWNLOAD_DELAY:false,
    middlewares:[new ControlledDownloader({resolvePage:()=>facade,navigationTimeout:input.timeoutMs??30000})]
  });
  const spider=new ChromeSpider({name:'opendesk_capture',start_urls:[target.href],itemConfig,
    timeout:input.timeoutMs??30000,output:null,
    puppeteerConfig:{waitForSelector:input.waitForSelector||undefined}});
  spider.page=facade;
  engine.spider=spider;
  const data=await engine.start();
  if (!Array.isArray(data)) throw new Error('E_CAPTURE_RESULT');
  return {data:JSON.parse(JSON.stringify(data)),stats:engine.getRunStats(),engine:engine.runResult};
}
