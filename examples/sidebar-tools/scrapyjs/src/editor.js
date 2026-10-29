// Pure form conversion; complex engine rules remain lossless in the JSON editor.
export function fieldForm(key, rule) {
  const match = typeof rule === 'string' && /^(.*)::([\w:-]+)$/.exec(rule);
  if (typeof rule !== 'string' || /^(?:xpath=|\(?\.?\/)/.test(rule) ||
      (rule.includes('::') && (!match || ['html','innerHTML','outerHTML'].includes(match[2]))) ||
      !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) return null;
  return {originalKey:key,key,selector:match ? match[1] : rule,
    read:!match || match[2]==='text' ? 'text' : 'attr',attr:match && match[2]!=='text' ? match[2] : ''};
}
export function applyField(config, form) {
  const key=form.key.trim(),selector=form.selector.trim(),attr=form.attr.trim();
  if ((key || selector) && (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ||
      ['constructor','prototype','__proto__'].includes(key) || !selector)) throw Error('请填写有效字段名与 CSS 选择器');
  if (form.originalKey && !key) throw Error('字段名不能为空；删除请使用删除字段');
  if (key && form.read==='attr' && !/^[\w:-]+$/.test(attr)) throw Error('请填写有效属性名');
  if (form.originalKey && key!==form.originalKey && Object.hasOwn(config.itemConfig,key)) throw Error('已有同名字段，请使用不同名称');
  const itemConfig={...config.itemConfig};
  for (const [value,name] of [[form.container,'_listContainer'],[form.item,'_listItem']]) {
    if (value.trim()) itemConfig[name]=value.trim(); else delete itemConfig[name];
  }
  if (form.originalKey && key!==form.originalKey) delete itemConfig[form.originalKey];
  if (key) itemConfig[key]=selector+'::'+(form.read==='attr' ? attr : 'text');
  return {...config,itemConfig};
}
export function crawlForm(config) {
  const d=config.detail;
  return {next:config.nextPageSelector||'',maxPages:config.maxPages??5,dedupe:config.dedupeKey||'',
    enabled:Boolean(d),urlField:d?.urlField||'',identity:d?.identityField||'',
    fields:JSON.stringify(d?.itemConfig||{},null,2),numbers:(d?.numberFields||[]).join(',')};
}
export function applyCrawl(config, form) {
  const next={...config};
  delete next.nextPageSelector;delete next.maxPages;delete next.dedupeKey;
  if(form.next.trim()){next.nextPageSelector=form.next.trim();next.maxPages=Number(form.maxPages);}
  if(form.dedupe.trim())next.dedupeKey=form.dedupe.trim();
  if(form.enabled) next.detail={...(config.detail||{}),urlField:form.urlField.trim(),identityField:form.identity.trim(),
    itemConfig:JSON.parse(form.fields),numberFields:form.numbers.split(',').map(k=>k.trim()).filter(Boolean)};
  else delete next.detail;
  return next;
}
