// EXP-005: explicit, fixture-scoped, read-only seller listing diagnostic.
// No network access, generic webpage scraping, Chrome API or hidden state.
export const FIXTURE_SELECTOR='[data-opendesk-listing-fixture="seller-listing-v1"]';
export const FIXTURE_URL='http://127.0.0.1:43111/demo-form.html';
const allowedOrigin='http://127.0.0.1:43111';
const allowedPath='/demo-form.html';

function fail(code,message){throw Object.assign(new Error(message),{code});}
function field(scope,name){
  const elements=scope.querySelectorAll(`[data-listing-field="${name}"]`);
  if(elements.length!==1)fail('E_LISTING_FIELD','商品字段 '+name+' 缺失或重复，已停止读取。');
  const control=elements[0];
  if(!['INPUT','TEXTAREA','SELECT'].includes(control.tagName)||typeof control.value!=='string'||control.value.length>256)
    fail('E_LISTING_VALUE','商品字段 '+name+' 类型或长度不受支持，已停止读取。');
  return control.value.trim();
}
export function readListing(doc){
  const location=doc?.defaultView?.location;
  if(!location||location.origin!==allowedOrigin||location.pathname!==allowedPath)
    fail('E_LISTING_SCOPE','仅允许在本地 Browser Test Lab 的 demo-form.html 运行检查。');
  const fixtures=doc.querySelectorAll(FIXTURE_SELECTOR);
  if(fixtures.length!==1)fail('E_LISTING_FIXTURE','未找到唯一且已标记的商品测试区域，未读取其他网页内容。');
  const scope=fixtures[0];
  const rows=[...scope.querySelectorAll('[data-listing-variant]')];
  if(rows.length>30)fail('E_LISTING_LIMIT','变体超过演示限制（30），未进行读取。');
  return {
    title:field(scope,'title'),description:field(scope,'description'),parentSku:field(scope,'parentSku'),
    variants:rows.map(row=>({sku:field(row,'sku'),option:field(row,'option'),
      price:field(row,'price'),stock:field(row,'stock')})),
    source:{kind:'local-fixture',url:allowedOrigin+allowedPath}
  };
}
const normalized=value=>String(value??'').normalize('NFKC').trim().toUpperCase();
export function inspectListing(data){
  if(!data||!Array.isArray(data.variants))fail('E_LISTING_DATA','商品结构无效。');
  const issues=[];
  function add(severity,code,field,message,advice){issues.push({severity,code,field,message,advice});}
  if(!String(data.title||'').trim())add('error','TITLE_REQUIRED','title','商品标题为空','补充清晰的商品标题');
  else if([...String(data.title)].length>120)add('warning','TITLE_LONG','title','商品标题超过演示建议的 120 字','根据实际平台限制检查并缩短');
  if(!String(data.description||'').trim())add('warning','DESCRIPTION_EMPTY','description','商品描述为空','补充规格、材质与注意事项');
  const parent=normalized(data.parentSku);
  if(!parent)add('error','PARENT_SKU_REQUIRED','parentSku','主 SKU 为空','填写商品的唯一主 SKU');
  const seenSku=new Map(parent?[[parent,'主 SKU']]:[]);
  const seenOptions=new Map();
  if(data.variants.length===0)add('warning','VARIANTS_EMPTY','variants','当前商品没有变体','确认商品为单规格商品，或补充变体');
  if(data.variants.length>30)fail('E_LISTING_LIMIT','变体超过演示限制（30）。');
  data.variants.forEach((row,index)=>{
    const position=index+1,base=`variants[${index}]`,sku=normalized(row?.sku),option=normalized(row?.option);
    if(!sku)add('error','VARIANT_SKU_REQUIRED',base+'.sku',`变体 ${position} 的 SKU 为空`,'填写唯一变体 SKU');
    else if(seenSku.has(sku))add('error','DUPLICATE_SKU',base+'.sku',
      `变体 ${position} 的 SKU 与${seenSku.get(sku)}重复`,'修改为独立 SKU（忽略大小写和首尾空格）');
    else seenSku.set(sku,`变体 ${position}`);
    if(!option)add('error','OPTION_REQUIRED',base+'.option',`变体 ${position} 的规格选项为空`,'填写颜色、尺寸等选项');
    else if(seenOptions.has(option))add('error','DUPLICATE_OPTION',base+'.option',
      `变体 ${position} 的规格与变体 ${seenOptions.get(option)}重复`,'确保同一商品每个规格组合唯一');
    else seenOptions.set(option,position);
    const price=String(row?.price??'').trim();
    if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(price)||Number(price)<=0)
      add('error','INVALID_PRICE',base+'.price',`变体 ${position} 的测试价格必须为正数（最多两位小数）`,'检查价格输入；本工具不修改售价');
    const stock=String(row?.stock??'').trim();
    if(!/^(?:0|[1-9]\d{0,8})$/.test(stock))
      add('error','INVALID_STOCK',base+'.stock',`变体 ${position} 的库存必须是非负整数`,'检查库存输入；本工具不更改库存');
  });
  const errors=issues.filter(issue=>issue.severity==='error').length;
  const warnings=issues.length-errors;
  return {status:errors?'issues':warnings?'attention':'ok',errors,warnings,
    variants:data.variants.length,issues,source:data.source?.kind==='local-fixture'?'local-fixture':'unknown'};
}
