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
    evaluate:(callback,...args)=>page.evaluate(callback,...args)
  });
}
