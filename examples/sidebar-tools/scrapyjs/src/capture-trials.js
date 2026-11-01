// Candidate only: Douban robots returned 403 on 2026-10-31. These CSS rules
// have NOT been checked against a permitted current response or live records.
export const DOUBAN_REQUIREMENT='采集豆瓣读书列表前 3 页，提取书名、图书链接、出版信息原文、评分；以图书链接去重，缺失字段保留空字符串。只访问公开列表，不进入详情，不登录。';
export const doubanTrialConfig=()=>({url:'https://book.douban.com/top250',
  itemConfig:{_listContainer:'.indent',_listItem:'table',title:'.pl2 a::text',url:'.pl2 a::href',publication:'p.pl::text',rating:'.rating_nums::text'},
  nextPageSelector:'.paginator .next a',maxPages:3,dedupeKey:'url'});
export function trialRequirement(config){
  if(config.url===doubanTrialConfig().url)return DOUBAN_REQUIREMENT;
  return `仅采集 ${config.url} 及同源下一页的公开列表。保持当前配置字段、去重键及分页上限，生成本地静态 CSS 声明式规则；先试采 3 页。缺失字段保留空字符串，不进入详情、不登录、不执行代码，不保存或启动 full。`;
}
export function validateLocalCapture(value,validate){
  const config=validate(value,{runtime:'local'});
  const allowed=['url','itemConfig','nextPageSelector','maxPages','dedupeKey','timeoutMs','waitForSelector'];
  const unsupported=Object.keys(config).filter(key=>!allowed.includes(key));
  if(unsupported.length)throw Error('本机静态采集不支持 '+unsupported.join('、')+'；原配置已保留，可使用原浏览器采集。');
  function walk(fields){for(const [key,rule] of Object.entries(fields)){
    if(key==='_listContainer'||key==='_listItem')continue;
    if(typeof rule==='string'){
      if(/^\s*(?:\.?\/|xpath=|(?:ancestor|ancestor-or-self|attribute|child|descendant|descendant-or-self|following|following-sibling|namespace|parent|preceding|preceding-sibling|self)::)/.test(rule)||/::(?:innerHTML|outerHTML)$/.test(rule))throw Error('本机只支持静态 CSS 文本或属性读取。');
    }else if(typeof rule?.selector==='string'){
      if(![undefined,'text','attr'].includes(rule.read)||['innerHTML','outerHTML'].includes(rule.attr))throw Error('本机不支持此字段读取方式。');
      walk({value:rule.selector});
    }else walk(rule);
  }}
  walk(config.itemConfig);return config;
}

// The fixed trial may correct selectors, never silently rewrite the user's
// requested data shape, pagination policy, dedupe identity or full-run budget.
export function assertTrialContract(before,after){
  function shape(fields){
    if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('AI 缺少原任务要求的字段。');
    return Object.fromEntries(Object.keys(fields).filter(key=>!['_listContainer','_listItem'].includes(key)).sort().map(key=>{
      const rule=fields[key];return [key,typeof rule==='string'||typeof rule?.selector==='string'?'field':shape(rule)];
    }));
  }
  if(JSON.stringify(shape(before?.itemConfig))!==JSON.stringify(shape(after.itemConfig)))throw Error('AI 改变了任务要求的字段；提案未采用。');
  if((before.maxPages??50)!==(after.maxPages??50))throw Error('AI 改变了任务要求的分页上限；提案未采用。');
  if((before.dedupeKey??null)!==(after.dedupeKey??null))throw Error('AI 改变了任务要求的去重键；提案未采用。');
  if(Boolean(before.nextPageSelector)!==Boolean(after.nextPageSelector))throw Error('AI 改变了任务要求的分页方式；提案未采用。');
  for(const key of ['_listContainer','_listItem'])
    if(Boolean(before.itemConfig[key])!==Boolean(after.itemConfig[key]))throw Error('AI 改变了任务要求的列表范围；提案未采用。');
}
