// Consumption-only transforms. The complete pinned upstream source is retained
// under vendor; these unavailable backends fail explicitly, never emulate Node.
module.exports=function(source){
  const file=this.resourcePath.replaceAll('\\','/');
  let output=source;
  if(file.endsWith('/core/Scrapy.js')) {
    output=output.replace("const DownloaderMiddleware = require('../middleware/DownloaderMiddleware');",'');
    output=output.replace('return [new DownloaderMiddleware()];',"throw new Error('E_SCRAPY_BACKEND: explicit controlled Page middleware required');");
  }
  if(file.endsWith('/middleware/DownloaderMiddlewareManager.js')) {
    output=output.replace("const DownloaderMiddleware = require('./DownloaderMiddleware');",'');
    output=output.replace('this.middlewares = middlewares.length > 0 ? middlewares : [new DownloaderMiddleware()];',"if (!middlewares.length) throw new Error('E_SCRAPY_BACKEND: explicit middleware required'); this.middlewares = middlewares;");
  }
  // Optional HTML parsing, HTTP delivery and Node helpers are not in the first
  // controlled Page graph. Invocation is an explicit unsupported capability.
  for(const spec of ['cheerio','axios','fs','path','crypto','../ai/ConfigExecutor','./parse-page']) {
    const escaped=spec.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    output=output.replace(new RegExp("require\\(['\"]"+escaped+"['\"]\\)",'g'),"(()=>{throw Object.assign(new Error('Unavailable in controlled Page profile: "+spec+"'),{code:'E_SCRAPY_BACKEND'});})()");
  }
  if(file.endsWith('/core/ChromeSpider.js')) {
    output=output.replace("const Processing = require('../ai/Processing');",'');
    output=output.replace("const BrowserValidation = require('../ai/BrowserValidation');",'');
    output=output.replace('super(config);', "super(config); if (Object.hasOwn(config,'validation') || Object.hasOwn(config,'processing')) throw Object.assign(new Error('Validation/processing migration is pending in controlled Page profile'), {code:'E_SCRAPY_PROFILE'});");
    output=output.replace(/Object\.prototype\.hasOwnProperty\.call\((?:this\.)?config, '(?:validation|processing)'\)/g,'false');
  }
  if(file.endsWith('/middleware/ChromeDownloaderMiddleware.js')) {
    output=output.replace("['goto', 'waitForNavigation', 'content', 'url']","['goto', 'waitForSelector', 'content', 'url']");
  }
  if(file.endsWith('/core/CrawlSpider.js')) {
    output=output.replace("const Rule = require('./Rule');",'');
    output=output.replace(/return rules\.map\(rule => \{[\s\S]*?\n    \}\);/, "if (rules.length) throw Object.assign(new Error('Link rule migration is pending in controlled Page profile'), {code:'E_SCRAPY_PROFILE'}); return [];");
  }
  return output;
};
