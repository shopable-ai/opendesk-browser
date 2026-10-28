// A facade over the admitted page. No window, ChromePage global or fake DOM.
export function controlledPage(page) {
  for (const name of ['url','goto','content','waitForSelector','evaluate']) {
    if (typeof page?.[name] !== 'function') throw new Error('Missing controlled page method: '+name);
  }
  return Object.freeze({
    url:()=>page.url(),
    goto:(url,options)=>page.goto(url,options),
    content:()=>page.content(),
    waitForSelector:(selector,options)=>page.waitForSelector(selector,options),
    evaluate:(callback,...args)=>page.evaluate(callback,...args),
    // Original ChromeSpider CSS handle backed by the public document-bound Locator.
    $:async selector=>{
      const locator=page.locator(selector);
      if(!await locator.count())return null;
      const first=locator.first();
      return Object.freeze({click:async()=>{
        const href=await first.getAttribute('href');
        if(href){
          // Full-document links must use the public authorized navigation handshake.
          const current=new URL(await page.url());
          const url=new URL(href,await page.evaluate(()=>document.baseURI));
          if(url.origin!=='http://127.0.0.1:43111'||url.username||url.password)throw new Error('E_CAPTURE_ORIGIN');
          if(url.origin!==current.origin||url.pathname!==current.pathname||url.search!==current.search)
            return page.goto(url.href,{waitUntil:'domcontentloaded'});
        }
        return first.click();
      }});
    },
    waitForTimeout:ms=>new Promise(resolve=>setTimeout(resolve,ms))
  });
}
