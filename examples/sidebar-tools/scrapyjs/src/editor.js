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
  const invalid=(message,fieldId)=>{throw Object.assign(Error(message),{fieldId});};
  if (form.originalKey && !key) invalid('字段名不能为空；删除请使用删除字段','field-key');
  if ((key || selector) && (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ||
      ['constructor','prototype','__proto__'].includes(key))) invalid('请填写有效字段名与 CSS 选择器','field-key');
  if(key&&!selector)invalid('请填写有效字段名与 CSS 选择器','field-selector');
  if (key && form.read==='attr' && !/^[\w:-]+$/.test(attr)) invalid('请填写有效属性名','field-attr');
  if (form.originalKey && key!==form.originalKey && Object.hasOwn(config.itemConfig,key)) invalid('已有同名字段，请使用不同名称','field-key');
  const itemConfig={...config.itemConfig};
  for (const [value,name] of [[form.container,'_listContainer'],[form.item,'_listItem']]) {
    if (value.trim()) itemConfig[name]=value.trim(); else delete itemConfig[name];
  }
  if (form.originalKey && key!==form.originalKey) delete itemConfig[form.originalKey];
  if (key) itemConfig[key]=selector+'::'+(form.read==='attr' ? attr : 'text');
  return {...config,itemConfig};
}
// The inline editor keeps the engine's complete rule string. Field edits never
// write a stale copy of the collection-wide scope; that is a separate action.
export function applyInlineField(config, form) {
  const invalid=(message,fieldId)=>{throw Object.assign(Error(message),{fieldId});};
  if(form.scopeOnly)return applyField(config,{...form,key:'',originalKey:'',selector:'',read:'text',attr:''});
  const key=form.key.trim(),rule=form.rule.trim();
  if(!key)invalid('字段名不能为空；删除请使用删除字段','field-key');
  if(!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key))invalid('字段名须以字母开头，仅含字母、数字或下划线','field-key');
  if(!rule)invalid('请填写采集规则，例如 .title::text','field-rule');
  const parsed=fieldForm(key,rule);
  if(!parsed)invalid('此规则需要在「配置 JSON」中编辑，当前输入已保留','field-rule');
  if(key!==form.originalKey&&Object.hasOwn(config.itemConfig,key))invalid('已有同名字段，请使用不同名称','field-key');
  let next;
  try{next=applyField(config,{...parsed,originalKey:form.originalKey,
    container:config.itemConfig._listContainer||'',item:config.itemConfig._listItem||''});}
  catch(error){if(['field-selector','field-attr'].includes(error.fieldId))error.fieldId='field-rule';throw error;}
  // Do not normalize a valid no-suffix rule merely because its name was edited.
  next.itemConfig[key]=rule;
  // A rename keeps its row (and keyboard focus) in the original position.
  if(form.originalKey&&key!==form.originalKey)next.itemConfig=Object.fromEntries(
    Object.entries(config.itemConfig).map(([name,value])=>name===form.originalKey?[key,rule]:[name,value]));
  if(form.originalKey&&key!==form.originalKey&&Object.hasOwn(config.output?.fieldNames||{},form.originalKey)){
    const fieldNames={...config.output.fieldNames};
    // The renamed field keeps its own label, replacing a stale destination map.
    fieldNames[key]=fieldNames[form.originalKey];delete fieldNames[form.originalKey];
    next.output={...config.output,fieldNames};
  }
  if(form.originalKey && key!==form.originalKey && config.output?.fieldOrder)
    next.output={...next.output,fieldOrder:config.output.fieldOrder.map(name=>name===form.originalKey?key:name)};
  return next;
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
