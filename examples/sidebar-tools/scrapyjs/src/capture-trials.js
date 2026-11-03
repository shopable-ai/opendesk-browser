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

// A terminal protocol read is metadata only outside CSS quotes, escapes,
// brackets and pseudo arguments. Element-only selectors cannot contain it.
function escapeEnd(value,index){
  let end=index+1;
  if(/[0-9a-f]/i.test(value[end]??'')){
    for(let digits=0;digits<6&&/[0-9a-f]/i.test(value[end]??'');digits++)end++;
    if(/[\t\n\f\r ]/.test(value[end]??'')){
      if(value[end]==='\r'&&value[end+1]==='\n')end++;
      end++;
    }
    return end;
  }
  return Math.min(value.length,index+2);
}

function terminalRead(value){
  let quote='',depth=0,split=-1;
  for(let i=0;i<value.length;i++){
    const char=value[i];
    if(char==='\\'){i=escapeEnd(value,i)-1;continue;}
    if(quote){if(char===quote)quote='';continue;}
    if(char==='"'||char==="'"){quote=char;continue;}
    if(value.slice(i,i+2)==='/*'){
      const end=value.indexOf('*/',i+2);if(end<0)return null;
      i=end+1;continue;
    }
    if(char==='['||char==='(')depth++;
    if(char===']'||char===')')depth--;
    if(depth===0&&value.slice(i,i+2)==='::'){split=i;i++;}
  }
  return split<0?null:value.slice(split+2).trim();
}

function defaultRead(selector){
  // Infer only an explicit type on every final CSS compound. A class, wildcard
  // or complex untyped pseudo alone cannot prove whether default reads return
  // text, a media src, or an anchor's text-with-href-fallback.
  const kinds=[];let compound='',last='',quote='',depth=0;
  const trimCss=value=>value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g,'');
  const finish=()=>{if(trimCss(compound))last=trimCss(compound);compound='';};
  const kind=()=>{
    const tag=last.match(/^([a-z][\w-]*)(?=[.#\[:]|\/\*|$)/i)?.[1].toLowerCase();
    return tag?(tag==='a'?'anchor':['img','video','audio'].includes(tag)?'attr:src':'text'):null;
  };
  for(let i=0;i<selector.length;i++){
    const char=selector[i];
    if(char==='\\'){const end=escapeEnd(selector,i);compound+=selector.slice(i,end);i=end-1;continue;}
    if(quote){compound+=char;if(char===quote)quote='';continue;}
    if(char==='"'||char==="'"){quote=char;compound+=char;continue;}
    if(selector.slice(i,i+2)==='/*'){
      const end=selector.indexOf('*/',i+2);if(end<0)return 'default:'+trimCss(selector);
      compound+=selector.slice(i,end+2);i=end+1;continue;
    }
    if(char==='['||char==='(')depth++;
    if(char===']'||char===')')depth--;
    if(depth===0&&(char===','||/[\t\n\f\r >+~]/.test(char))){
      finish();if(char===','){kinds.push(kind());last='';}continue;
    }
    compound+=char;
  }
  finish();kinds.push(kind());
  return kinds[0]&&kinds.every(value=>value===kinds[0])?kinds[0]:'default:'+trimCss(selector);
}

export function validateLocalCapture(value,validate){
  const {output,...config}=validate(value,{runtime:'local'});
  const allowed=['url','itemConfig','nextPageSelector','maxPages','dedupeKey','timeoutMs','waitForSelector'];
  const unsupported=Object.keys(config).filter(key=>!allowed.includes(key));
  if(unsupported.length)throw Error('本机静态采集不支持 '+unsupported.join('、')+'；原配置已保留，可使用原浏览器采集。');
  const elementSelector=selector=>{
    if(terminalRead(selector)!==null)throw Error('本机 CSS 必须选择元素；文本或属性读取请使用 read 描述符。');
  };
  for(const selector of [config.itemConfig._listContainer,config.itemConfig._listItem,config.waitForSelector,config.nextPageSelector])
    if(selector!==undefined)elementSelector(selector);
  function walk(fields,top=true){for(const [key,rule] of Object.entries(fields)){
    if(top&&(key==='_listContainer'||key==='_listItem'))continue;
    if(typeof rule==='string'){
      const attr=terminalRead(rule);
      if(/^\s*(?:\.?\/|xpath=|(?:ancestor|ancestor-or-self|attribute|child|descendant|descendant-or-self|following|following-sibling|namespace|parent|preceding|preceding-sibling|self)::)/.test(rule)||
        (attr!==null&&(!/^[\w-]+$/.test(attr)||['innerHTML','outerHTML'].includes(attr))))throw Error('本机只支持静态 CSS 文本或属性读取。');
    }else if(typeof rule?.selector==='string'){
      if(![undefined,'text','attr'].includes(rule.read)||['innerHTML','outerHTML'].includes(rule.attr))throw Error('本机不支持此字段读取方式。');
      elementSelector(rule.selector);walk({value:rule.selector},false);
    }else walk(rule,false);
  }}
  walk(config.itemConfig);return config;
}

// The fixed trial may correct selectors, never silently rewrite the user's
// requested data shape, pagination policy, dedupe identity or full-run budget.
export function assertTrialContract(before,after){
  function fieldContract(rule){
    let attr,cardinality='auto';
    if(typeof rule==='string'){
      attr=terminalRead(rule);
    }else{
      attr=rule.read==='attr'?rule.attr:rule.read;
      cardinality=rule.cardinality??'auto';
    }
    // Python reserves both text aliases even in read:attr descriptors.
    return {read:attr==null?defaultRead(typeof rule==='string'?rule:rule.selector):
      ['text','innerText'].includes(attr)?'text':'attr:'+attr,cardinality};
  }
  function shape(fields,withReads=false,top=true){
    if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('AI 缺少原任务要求的字段。');
    return Object.fromEntries(Object.keys(fields).filter(key=>!top||!['_listContainer','_listItem'].includes(key)).sort().map(key=>{
      const rule=fields[key],leaf=typeof rule==='string'||typeof rule?.selector==='string';
      return [key,leaf?(withReads?fieldContract(rule):'field'):shape(rule,withReads,false)];
    }));
  }
  if(JSON.stringify(shape(before?.itemConfig))!==JSON.stringify(shape(after.itemConfig)))throw Error('AI 改变了任务要求的字段；提案未采用。');
  if(JSON.stringify(shape(before.itemConfig,true))!==JSON.stringify(shape(after.itemConfig,true)))throw Error('AI 改变了字段读取方式或单值/多值约定；提案未采用。');
  if((before.maxPages??50)!==(after.maxPages??50))throw Error('AI 改变了任务要求的分页上限；提案未采用。');
  if((before.dedupeKey??null)!==(after.dedupeKey??null))throw Error('AI 改变了任务要求的去重键；提案未采用。');
  if(Boolean(before.nextPageSelector)!==Boolean(after.nextPageSelector))throw Error('AI 改变了任务要求的分页方式；提案未采用。');
  if(Boolean(before.itemConfig._listContainer)!==Boolean(after.itemConfig._listContainer)||
    (Boolean(before.itemConfig._listItem)!==Boolean(after.itemConfig._listItem)&&
      ![before.itemConfig._listItem??'*',after.itemConfig._listItem??'*'].every(selector=>selector.trim()==='*')))
    throw Error('AI 改变了任务要求的列表范围；提案未采用。');
}
