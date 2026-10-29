// A facade over the admitted page. No window, ChromePage global or fake DOM.
import {allowedUrl} from './capture-policy.js';
export function controlledPage(page) {
  for (const name of ['url','goto','content','locator','evaluate']) {
    if (typeof page?.[name] !== 'function') throw new Error('Missing controlled page method: '+name);
  }
  return Object.freeze({
    url:()=>page.url(),
    goto:(url,options)=>page.goto(allowedUrl(url),options),
    content:()=>page.content(),
    locator:selector=>page.locator(selector),
    // Read readiness is existential, not a claim that every row has arrived.
    waitForSelector:(selector,options={})=>page.locator(selector).first().waitFor({state:'attached',...options}),
    evaluate:(callback,...args)=>page.evaluate(callback,...args),
    // Original ChromeSpider CSS handle backed by the public document-bound Locator.
    $:async selector=>{
      const locator=page.locator(selector);
      const count=await locator.count();
      if(!count)return null;
      if(count!==1)throw Object.assign(new Error('Next-page selector must match exactly one element'),{code:'E_LOCATOR_STRICT'});
      return Object.freeze({click:async()=>{
        // Keep the strict Locator: it resolves again at action time, including
        // when the DOM changed after the existence check above.
        const href=await locator.getAttribute('href');
        if(href){
          // Full-document links must use the public authorized navigation handshake.
          const current=new URL(await page.url());
          const url=new URL(allowedUrl(href,await page.evaluate(()=>document.baseURI)));
          if(url.origin!==current.origin||url.pathname!==current.pathname||url.search!==current.search)
            return page.goto(url.href,{waitUntil:'domcontentloaded'});
        }
        return locator.click();
      }});
    },
    waitForTimeout:ms=>new Promise(resolve=>setTimeout(resolve,ms))
  });
}
